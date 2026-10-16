import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405, headers: { "content-type": "application/json" }
    });
  }

  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) {
      return new Response(JSON.stringify({ error: "authentication_required" }), {
        status: 401, headers: { "content-type": "application/json" }
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "invalid_session" }), {
        status: 401, headers: { "content-type": "application/json" }
      });
    }

    const body = await req.json();
    const siteId = String(body?.site_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(siteId)) {
      return new Response(JSON.stringify({ error: "invalid_site_id" }), {
        status: 400, headers: { "content-type": "application/json" }
      });
    }

    const secret = "vsec_" + Array.from(crypto.getRandomValues(new Uint8Array(24)))
      .map((b) => b.toString(16).padStart(2, "0")).join("");

    const bytes = new TextEncoder().encode(secret);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const hash = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0")).join("");

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data, error } = await admin
      .from("sites")
      .update({ secret_key_hash: hash, updated_at: new Date().toISOString() })
      .eq("id", siteId)
      .eq("owner_id", user.id)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      return new Response(JSON.stringify({ error: "site_not_found_or_not_owned" }), {
        status: 403, headers: { "content-type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ success: true, secret_key: secret }), {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" }
    });
  } catch {
    return new Response(JSON.stringify({ error: "invalid_request" }), {
      status: 400, headers: { "content-type": "application/json" }
    });
  }
});