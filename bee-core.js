/* BeeCaptcha v8 shared browser runtime */
window.Bee = (() => {
  const SUPABASE_URL = "https://zjghuovefnbuliovttqa.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_HPpTSfQrEFX3Xd5ffXiXWw_L6EXN2WX";
  const API = SUPABASE_URL + "/functions/v1";
  const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (m) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const copy = async (value) => {
    if (!value) return false;
    try { await navigator.clipboard.writeText(value); return true; }
    catch {
      const ta = document.createElement("textarea"); ta.value = value; document.body.appendChild(ta); ta.select();
      const ok = document.execCommand("copy"); ta.remove(); return ok;
    }
  };
  const fmt = (n) => Number(n || 0).toLocaleString();
  const date = (v) => v ? new Date(v).toLocaleDateString(undefined, {year:"numeric",month:"short",day:"numeric"}) : "—";
  const dateTime = (v) => v ? new Date(v).toLocaleString() : "—";
  const relative = (v) => {
    if (!v) return "—";
    const sec = Math.max(1, Math.floor((Date.now() - new Date(v).getTime()) / 1000));
    if (sec < 60) return sec + "s ago";
    if (sec < 3600) return Math.floor(sec / 60) + "m ago";
    if (sec < 86400) return Math.floor(sec / 3600) + "h ago";
    return Math.floor(sec / 86400) + "d ago";
  };
  const domains = (v) => String(v || "").split(/\n|,/).map((x) => x.trim()).filter(Boolean);
  const slug = (v) => String(v || "site").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"") || "site";
  const query = () => new URLSearchParams(location.search);
  const applyPlanBadge = async () => {
    const host = $(".side-bottom b");
    if (!host) return null;
    try { const {data} = await db.rpc("vin_get_billing_summary"); const plan = (data?.plan || "free").toUpperCase(); host.textContent = plan === "FREE" ? "Free Plan" : plan + " Plan"; return data; } catch { return null; }
  };
  const requireUser = async () => {
    const { data, error } = await db.auth.getUser();
    if (error || !data?.user) { location.href = "login.html"; return null; }
    $$("#userEmail,.user-email").forEach((el) => { el.textContent = data.user.email || "Account"; });
    const initial = (data.user.email || "B").slice(0,1).toUpperCase();
    $$(".avatar").forEach((el) => { el.textContent = initial; });
    applyPlanBadge();
    return data.user;
  };
  const logout = async () => { await db.auth.signOut(); location.href = "index.html"; };
  const wireLogout = () => $$("#logout").forEach((el) => el.addEventListener("click", logout));
  const setBusy = (button, busy, busyText = "Loading…") => {
    if (!button) return;
    if (!button.dataset.originalText) button.dataset.originalText = button.textContent;
    button.disabled = busy;
    button.textContent = busy ? busyText : button.dataset.originalText;
    button.classList.toggle("is-busy", busy);
  };
  const notice = (message, type = "bad", selector = "#alert") => {
    const el = $(selector); if (!el) return;
    el.innerHTML = `<div class="alert ${type}">${esc(message)}</div>`;
    if (type === "ok") setTimeout(() => { el.innerHTML = ""; }, 3500);
  };
  const openSite = (id) => { if (id) location.href = "website.html?id=" + encodeURIComponent(id); };
  const openIntegration = (id) => { if (id) location.href = "integration.html?site_id=" + encodeURIComponent(id); };
  const featureRoute = (value) => {
    const q = String(value || "").trim().toLowerCase();
    if (q === "analytics") return "analytics.html";
    if (q === "billing" || q === "pricing") return "pricing.html";
    if (q === "settings") return "settings.html";
    if (q === "integration" || q === "docs" || q === "documentation") return "integration.html";
    if (q === "create" || q === "create website") return "create.html";
    return null;
  };
  const csv = (filename, rows) => {
    const body = rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g,'""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([body], {type:"text/csv;charset=utf-8"}));
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 500);
  };
  return {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,API,db,$,$$,esc,copy,fmt,date,dateTime,relative,domains,slug,query,requireUser,applyPlanBadge,logout,wireLogout,setBusy,notice,openSite,openIntegration,featureRoute,csv,sleep};
})();
