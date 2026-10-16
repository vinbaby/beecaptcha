import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
const ADMIN_KEY = secretKeys.default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const DASHBOARD_ORIGIN = "https://beecaptcha.vercel.app";

const headersFor = (origin: string | null): Record<string, string> => ({
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "vary": "Origin",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  ...(origin === DASHBOARD_ORIGIN ? { "access-control-allow-origin": DASHBOARD_ORIGIN } : {})
});
const json = (body: unknown, status = 200, origin: string | null = null) =>
  new Response(JSON.stringify(body), { status, headers: headersFor(origin) });
const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
};
const normalizedDomain = (value: string): string => {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "";
  const wildcard = raw.startsWith("*.");
  const bare = wildcard ? raw.slice(2) : raw;
  try {
    const host = new URL(bare.includes("://") ? bare : "https://" + bare).host;
    return wildcard ? "*." + host : host;
  } catch {
    return raw.replace(/^https?:\/\//, "").split(/[/?#]/)[0].replace(/\.$/, "");
  }
};
const domainAllowsDashboard = (domains: unknown): boolean => {
  if (!Array.isArray(domains)) return false;
  const host = new URL(DASHBOARD_ORIGIN).host.toLowerCase();
  return domains.some((item) => {
    const d = normalizedDomain(String(item ?? ""));
    if (d.startsWith("*.")) {
      const suffix = d.slice(2);
      return host !== suffix && host.endsWith("." + suffix);
    }
    return d === host;
  });
};
type Verification = { site_id: string | null; valid: boolean; reason: string };
const readVerification = (value: unknown): Verification | null => {
  if (!Array.isArray(value) || !value.length) return null;
  return value[0] as Verification;
};

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: headersFor(origin) });
  if (req.method !== "POST") return json({ success: false, code: "method_not_allowed" }, 405, origin);
  if (origin !== DASHBOARD_ORIGIN) return json({ success: false, code: "origin_not_allowed" }, 403, origin);
  if (!SUPABASE_URL || !ANON_KEY || !ADMIN_KEY) return json({ success: false, code: "server_not_configured" }, 500, origin);

  const authorization = req.headers.get("authorization") ?? "";
  const accessToken = authorization.replace(/^Bearer\s+/i, "");
  if (!accessToken) return json({ success: false, code: "authentication_required" }, 401, origin);

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: "Bearer " + accessToken } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const authResult = await userClient.auth.getUser(accessToken);
  const user = authResult.data?.user;
  if (authResult.error || !user) return json({ success: false, code: "invalid_session" }, 401, origin);

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return json({ success: false, code: "invalid_request" }, 400, origin); }
  const siteId = typeof body.site_id === "string" ? body.site_id : "";
  if (!/^[0-9a-f-]{36}$/i.test(siteId)) return json({ success: false, code: "invalid_request" }, 400, origin);

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
  if (!domainAllowsDashboard(site.allowed_domains)) {
    return json({ success: false, code: "dashboard_domain_not_on_allowlist" }, 403, origin);
  }

  const fixtureIds: string[] = [];
  const checks: Array<{ id: string; pass: boolean; detail: string }> = [];
  const fixture = async (answer: string, expiresAt: string) => {
    const id = crypto.randomUUID();
    const token = crypto.randomUUID() + "." + crypto.randomUUID();
    const answerHash = await sha256(answer.toLowerCase().trim());
    const tokenHash = await sha256(token);
    const inserted = await admin.from("captcha_challenges").insert({
      id,
      site_id: site.id,
      challenge_type: "image_select_v1",
      challenge_data: { lab_fixture: true },
      answer_hash: answerHash,
      token_hash: tokenHash,
      expires_at: expiresAt
    });
    if (inserted.error) throw new Error("fixture_insert_failed");
    fixtureIds.push(id);
    return { id, tokenHash };
  };
  const verify = async (id: string, answer: string, tokenHash: string, now = new Date().toISOString()) => {
    const result = await admin.rpc("vin_verify_answer", {
      p_challenge_id: id,
      p_answer: answer,
      p_token_hash: tokenHash,
      p_now: now
    });
    if (result.error) throw new Error("verification_rpc_failed");
    return readVerification(result.data);
  };
  const addCheck = (id: string, pass: boolean, detail: string) => checks.push({ id, pass, detail });

  let runError = false;
  try {
    const now = Date.now();
    const good = await fixture("known-correct-answer", new Date(now + 120_000).toISOString());
    const first = await verify(good.id, "known-correct-answer", good.tokenHash);
    const replay = await verify(good.id, "known-correct-answer", good.tokenHash);
    addCheck("valid_answer_once", first?.valid === true && first.reason === "ok", "A correct answer is accepted once.");
    addCheck("token_replay_blocked", replay?.valid === false && replay.reason === "replay", "A previously accepted token is rejected on replay.");

    const invalidTokenFixture = await fixture("token-fixture-answer", new Date(now + 120_000).toISOString());
    const invalidToken = await verify(invalidTokenFixture.id, "token-fixture-answer", await sha256("deliberately-wrong-token"));
    const afterInvalidToken = await verify(invalidTokenFixture.id, "token-fixture-answer", invalidTokenFixture.tokenHash);
    addCheck("invalid_token_blocked", invalidToken?.valid === false && invalidToken.reason === "invalid_token", "A mismatched challenge token is rejected.");
    addCheck("invalid_token_does_not_consume", afterInvalidToken?.valid === true && afterInvalidToken.reason === "ok", "A bad token cannot consume a legitimate challenge.");

    const wrongFixture = await fixture("real-answer-not-used", new Date(now + 120_000).toISOString());
    let sequenceOk = true;
    for (let attempt = 1; attempt <= 5; attempt++) {
      const wrong = await verify(wrongFixture.id, "deliberately-wrong-answer", wrongFixture.tokenHash);
      const expected = attempt < 5 ? "invalid_answer" : "attempts_exceeded";
      if (wrong?.valid !== false || wrong.reason !== expected) sequenceOk = false;
    }
    const afterLimit = await verify(wrongFixture.id, "real-answer-not-used", wrongFixture.tokenHash);
    addCheck("wrong_answer_attempt_limit", sequenceOk, "Wrong answers are limited and the fifth failed attempt locks the challenge.");
    addCheck("attempt_limit_consumes_challenge", afterLimit?.valid === false && afterLimit.reason === "replay", "The correct answer cannot be submitted after the attempt limit is reached.");

    const expiredFixture = await fixture("expired-fixture-answer", new Date(now - 60_000).toISOString());
    const expired = await verify(expiredFixture.id, "expired-fixture-answer", expiredFixture.tokenHash);
    addCheck("expired_challenge_blocked", expired?.valid === false && expired.reason === "expired", "Expired challenges are rejected.");
  } catch {
    runError = true;
  }

  let cleanupFailed = false;
  if (fixtureIds.length) {
    const cleanup = await admin.from("captcha_challenges").delete().in("id", fixtureIds).eq("site_id", site.id);
    cleanupFailed = Boolean(cleanup.error);
  }
  if (cleanupFailed) {
    return json({ success: false, code: "test_cleanup_failed", checks, cleanup_failed: true }, 500, origin);
  }
  if (runError) return json({ success: false, code: "server_test_failed", checks }, 500, origin);
  return json({ success: checks.every((check) => check.pass), checks }, 200, origin);
});
