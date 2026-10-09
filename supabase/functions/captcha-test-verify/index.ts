import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
const ADMIN_KEY = secretKeys.default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const DASHBOARD_ORIGIN = "https://beecaptcha.vercel.app";

const headersFor = (origin: string | null): Record<string, string> => {
  const headers: Record<string, string> = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "vary": "Origin",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "authorization, apikey, content-type, x-client-info"
  };
  if (origin === DASHBOARD_ORIGIN) headers["access-control-allow-origin"] = DASHBOARD_ORIGIN;
  return headers;
};
const json = (body: unknown, status = 200, origin: string | null = null) =>
  new Response(JSON.stringify(body), { status, headers: headersFor(origin) });
const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
};
const decodePayload = (value: string) => {
  try {
    const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
    const decoded = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
    const payload = JSON.parse(decoded);
    if (!payload || typeof payload !== "object") return null;
    if (typeof payload.challenge_id !== "string" || typeof payload.token !== "string" || typeof payload.answer !== "string") return null;
    return payload as { challenge_id: string; token: string; answer: string };
  } catch {
    return null;
  }
};

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: headersFor(origin) });
  if (req.method !== "POST") return json({ success: false, code: "method_not_allowed" }, 405, origin);
  if (origin !== DASHBOARD_ORIGIN) return json({ success: false, code: "origin_not_allowed" }, 403, origin);

  try {
    const authorization = req.headers.get("authorization") ?? "";
    const accessToken = authorization.replace(/^Bearer\s+/i, "");
    if (!accessToken || !ANON_KEY || !ADMIN_KEY) {
      return json({ success: false, code: "authentication_required" }, 401, origin);
    }

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: "Bearer " + accessToken } },
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const authResult = await userClient.auth.getUser(accessToken);
    const user = authResult.data?.user;
    if (authResult.error || !user) return json({ success: false, code: "invalid_session" }, 401, origin);

    const body = await req.json();
    const siteId = typeof body?.site_id === "string" ? body.site_id : "";
    const verificationToken = typeof body?.verification_token === "string" ? body.verification_token : "";
    if (!/^[0-9a-f-]{36}$/i.test(siteId) || !verificationToken) {
      return json({ success: false, code: "invalid_request" }, 400, origin);
    }
    const payload = decodePayload(verificationToken);
    if (!payload) return json({ success: false, code: "invalid_verification_token" }, 400, origin);

    const admin = createClient(SUPABASE_URL, ADMIN_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const siteResult = await admin.from("sites")
      .select("id,owner_id,status,allowed_domains")
      .eq("id", siteId)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (siteResult.error) return json({ success: false, code: "site_lookup_failed" }, 500, origin);
    const site = siteResult.data;
    if (!site) return json({ success: false, code: "site_not_found_or_not_owned" }, 403, origin);
    if (site.status !== "active") return json({ success: false, code: "site_disabled" }, 409, origin);
    const allowedDomains = Array.isArray(site.allowed_domains) ? site.allowed_domains : [];
    if (!allowedDomains.some((domain: unknown) => {
      const d = String(domain ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      return d === "beecaptcha.vercel.app";
    })) {
      return json({ success: false, code: "dashboard_domain_not_on_allowlist" }, 403, origin);
    }

    const verification = await admin.rpc("vin_verify_answer", {
      p_challenge_id: payload.challenge_id,
      p_answer: payload.answer.trim().toLowerCase(),
      p_token_hash: await sha256(payload.token),
      p_now: new Date().toISOString()
    });
    if (verification.error) return json({ success: false, code: "verification_backend_error" }, 500, origin);
    const row = Array.isArray(verification.data) ? verification.data[0] : null;
    if (!row || row.site_id !== site.id) return json({ success: false, code: "invalid_challenge" }, 400, origin);
    if (row.valid !== true) return json({ success: false, code: row.reason || "verification_failed" }, 400, origin);

    return json({
      success: true,
      verified: true,
      message: "The server verified the answer, challenge token, expiry, and single-use status.",
      challenge_id: payload.challenge_id
    }, 200, origin);
  } catch {
    return json({ success: false, code: "internal_error" }, 500, origin);
  }
});
