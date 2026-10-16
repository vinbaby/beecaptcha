import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const paddleApiKey = Deno.env.get("PADDLE_API_KEY")!;
const paddleEnvironment = Deno.env.get("PADDLE_ENVIRONMENT") ?? "sandbox";
const paddleBaseUrl = paddleEnvironment === "live"
  ? "https://api.paddle.com"
  : "https://sandbox-api.paddle.com";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "authentication_required" }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser(token);
    if (userError || !user) return json({ error: "invalid_session" }, 401);

    const body = await req.json();
    const plan = String(body?.plan ?? "");
    if (!["pro", "business"].includes(plan)) return json({ error: "invalid_plan" }, 400);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: planRow, error: planError } = await admin
      .from("billing_plans")
      .select("code,paddle_price_id,active")
      .eq("code", plan)
      .eq("active", true)
      .maybeSingle();

    if (planError || !planRow?.paddle_price_id) {
      return json({ error: "paddle_price_not_configured" }, 503);
    }

    const paddleResponse = await fetch(`${paddleBaseUrl}/transactions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${paddleApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        items: [{ price_id: planRow.paddle_price_id, quantity: 1 }],
        collection_mode: "automatic",
        custom_data: {
          owner_id: user.id,
          plan
        }
      })
    });

    const payload = await paddleResponse.json();
    if (!paddleResponse.ok) {
      return json({ error: "paddle_transaction_failed", details: payload?.error?.code ?? "unknown" }, 502);
    }

    return json({
      success: true,
      transaction_id: payload?.data?.id ?? null,
      checkout_url: payload?.data?.checkout?.url ?? null
    });
  } catch {
    return json({ error: "invalid_request" }, 400);
  }
});