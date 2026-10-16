import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const webhookSecret = Deno.env.get("PADDLE_WEBHOOK_SECRET")!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });

function parseSignature(header: string) {
  let ts = "";
  const h1: string[] = [];
  for (const part of header.split(";")) {
    const [k, ...rest] = part.split("=");
    const value = rest.join("=");
    if (k === "ts") ts = value;
    if (k === "h1" && value) h1.push(value);
  }
  return { ts, h1 };
}

function hex(bytes: Uint8Array) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message))));
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const rawBody = await req.text();
    const signatureHeader = req.headers.get("paddle-signature") ?? "";
    if (!signatureHeader || !webhookSecret) return json({ error: "webhook_not_configured" }, 503);

    const { ts, h1 } = parseSignature(signatureHeader);
    const tsNumber = Number(ts);
    if (!ts || !Number.isFinite(tsNumber) || h1.length === 0) return json({ error: "invalid_signature" }, 400);

    if (Math.abs(Date.now() / 1000 - tsNumber) > 5) return json({ error: "stale_signature" }, 400);

    const expected = await hmacSha256(webhookSecret, `${ts}:${rawBody}`);
    if (!h1.some((candidate) => candidate === expected)) return json({ error: "invalid_signature" }, 400);

    const event = JSON.parse(rawBody);
    const eventId = String(event?.event_id ?? "");
    const eventType = String(event?.event_type ?? "");
    const occurredAt = String(event?.occurred_at ?? "");
    const data = event?.data ?? {};
    if (!eventId || !eventType) return json({ error: "invalid_event" }, 400);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    let eventRow: any = null;
    const { data: inserted, error: insertError } = await admin
      .from("billing_webhook_events")
      .insert({
        provider: "paddle",
        event_id: eventId,
        event_type: eventType,
        payload: event
      })
      .select("id,processed_at")
      .maybeSingle();

    if (insertError?.code === "23505") {
      const { data: existing, error: existingError } = await admin
        .from("billing_webhook_events")
        .select("id,processed_at")
        .eq("provider", "paddle")
        .eq("event_id", eventId)
        .maybeSingle();
      if (existingError || !existing) return json({ error: "event_lookup_failed" }, 500);
      if (existing.processed_at) return json({ success: true, duplicate: true });
      eventRow = existing;
    } else if (insertError || !inserted) {
      return json({ error: "event_store_failed" }, 500);
    } else {
      eventRow = inserted;
    }

    if (!eventType.startsWith("subscription.")) {
      await admin.from("billing_webhook_events")
        .update({ processed_at: new Date().toISOString() })
        .eq("id", eventRow.id);
      return json({ success: true, ignored: true });
    }

    const customData = data?.custom_data ?? {};
    let ownerId = typeof customData?.owner_id === "string" ? customData.owner_id : null;
    const subscriptionId = String(data?.id ?? "");
    const customerId = data?.customer_id ? String(data.customer_id) : null;

    if (!ownerId && subscriptionId) {
      const { data: existing } = await admin
        .from("billing_subscriptions")
        .select("owner_id")
        .eq("provider", "paddle")
        .eq("provider_subscription_id", subscriptionId)
        .maybeSingle();
      ownerId = existing?.owner_id ?? null;
    }

    if (!ownerId || !/^[0-9a-f-]{36}$/i.test(ownerId)) return json({ error: "owner_not_resolved" }, 422);

    const recurringItem = Array.isArray(data?.items)
      ? data.items.find((item: any) => item?.recurring !== false)
      : null;
    const paddlePriceId = recurringItem?.price?.id ? String(recurringItem.price.id) : null;

    let planCode: string | null = null;
    if (paddlePriceId) {
      const { data: mappedPlan } = await admin
        .from("billing_plans")
        .select("code")
        .eq("paddle_price_id", paddlePriceId)
        .eq("active", true)
        .maybeSingle();
      planCode = mappedPlan?.code ?? null;
    }

    const { data: current } = await admin
      .from("billing_subscriptions")
      .select("plan,provider_event_occurred_at")
      .eq("owner_id", ownerId)
      .maybeSingle();

    if (!planCode) planCode = current?.plan ?? null;
    if (!planCode || !["free", "pro", "business"].includes(planCode)) return json({ error: "plan_not_resolved" }, 422);

    const statusMap: Record<string, string> = {
      active: "active",
      trialing: "trialing",
      past_due: "past_due",
      paused: "paused",
      canceled: "canceled"
    };
    const status = statusMap[String(data?.status ?? "")] ?? "incomplete";
    const period = data?.current_billing_period ?? null;
    const eventTime = occurredAt || new Date().toISOString();

    const updatePayload = {
      plan: planCode,
      status,
      provider: "paddle",
      provider_customer_id: customerId,
      provider_subscription_id: subscriptionId || null,
      current_period_start: period?.starts_at ?? null,
      current_period_end: period?.ends_at ?? null,
      provider_event_occurred_at: eventTime,
      updated_at: new Date().toISOString()
    };

    let updateQuery = admin
      .from("billing_subscriptions")
      .update(updatePayload)
      .eq("owner_id", ownerId);

    if (current?.provider_event_occurred_at) {
      updateQuery = updateQuery.gte("provider_event_occurred_at", current.provider_event_occurred_at);
    }

    const { error: updateError } = await updateQuery;
    if (updateError) return json({ error: "billing_update_failed" }, 500);

    await admin.from("billing_webhook_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("id", eventRow.id);

    return json({ success: true });
  } catch {
    return json({ error: "invalid_request" }, 400);
  }
});