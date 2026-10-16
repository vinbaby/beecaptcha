# BeeCaptcha — Production Release Gate

**Release status: not yet approved for paid public production.** Recent automated tests found a real flaw in the old shape/color challenge. Those challenge types are now disabled for new sites and rejected by the challenge API. This file records what is deployed and what still needs measured evidence before calling the service production-ready.

## Deployed backend

Supabase project: `zjghuovefnbuliovttqa`

- `captcha-challenge` v20: ACTIVE; supports `auto`, `image_select_v1`, `drag_drop_v1`, and `connect_dots_v1`. Auto mode alternates the two quick interactions, escalates to Image Select after at least two wrong attempts in 10 minutes from the same IP/browser fingerprint, and uses a randomized 15% Image Select audit to make the fast sequence less predictable. If the risk query fails, it fails safe to Image Select. The image proxy resolves Wikimedia Commons thumbnails, caches candidate URLs, falls back to the original Commons URL, and restricts final image hosts and response size.
- `widget` v15: ACTIVE; implements Image Select, Drag & Drop, and Connect the Dots, and emits a short-lived verification token for server-side checking. Image Select loads the original Wikimedia Commons URL first and uses the cached proxy if direct loading fails; it prevents verification if any tile remains unavailable.
- `captcha-verify` v5: ACTIVE; validates the site secret, challenge answer and token through the database verification RPC.
- `captcha-test-verify` v1: authenticated live answer check for the dashboard.
- `captcha-security-test` v1: authenticated server-side fixture checks for correct answer, one-time use, invalid tokens, attempt limits, and expiry.
- `site-rotate-secret` v3; `paddle-checkout` v3; `paddle-webhook` v4.

## Verification evidence — 2026-10-16

- The Postgres verification RPC regression suite previously passed for correct-answer acceptance once, replay rejection, wrong-token rejection without consuming a challenge, five-attempt lockout, and expiry rejection.
- The temporary regression rows were removed; a follow-up query reported zero leftover rows.
- `captcha-challenge` v20 and `widget` v15 deployments returned ACTIVE. The live test website `BeeCaptcha Test` is configured to `auto`. The dashboard's Bot Lab now uses graph traversal for Connect the Dots, SVG shape matching for Drag & Match, and COCO-SSD only when Image Select appears. Source checks passed; challenge mix and human completion metrics still need a real browser test on the newly enabled Auto mode.
- A full live browser end-to-end run of Auto mode was not completed in this update. Verify the actual rotation mix, the Image Select escalation after repeated wrong answers, and the refreshed analytics table after traffic is recorded. Human completion rate and statistical solver results remain unverified release-gate items.

## Controls now implemented

- Challenge answer is stored as a hash; the browser receives tile IDs and image URLs, not the correct answer or labels.
- Challenges expire after 120 seconds and a successful token is single-use.
- Five incorrect answers consume the challenge. Empty answers are treated as wrong answers.
- The internal verification RPC is executable only by `service_role`, not by `anon` or `authenticated`.
- Challenge request quotas are reserved atomically in Postgres: 20 per site/IP per minute and 120 per site per minute. Only an IP hash is stored in the limiter table.
- The limiter prefers Cloudflare/proxy IP headers and hashes the resulting value. Verify a trustworthy client IP header in deployed logs; if the hosting path does not provide one, do not rely on the per-IP quota until corrected.
- New websites now default to `Auto (Recommended)`; the existing `BeeCaptcha Test` site is switched to Auto. Auto is a usability strategy rather than a standalone bot-resistance guarantee: the fast puzzle structure is intentionally simple, so randomized Image Select audits and escalation remain important.

## Known gaps — block the public paid launch until resolved

1. **Image pool is still very small.** The active pilot pool currently has 16 distinct Wikimedia Commons images: four per class (bicycle, bus, car, and traffic light), each recorded as CC0 1.0 with source page/author metadata. The prior Unsplash rows have been disabled because the Unsplash license restricts compiling images to replicate a similar or competing service. Expand and visually quality-review the pool substantially (target at least 30 distinct images per class), verify each image loads and depicts the label unambiguously, review trademarks/privacy risks, then preferably mirror licensed files to first-party storage with provenance retained. Do not launch publicly based on this four-per-class pilot set.
2. **Automated resistance benchmark is implemented; broad results are still required.** Bot Lab now attempts graph traversal on Connect the Dots, SVG-shape matching on Drag & Match, and COCO-SSD lite MobileNet v2 on Image Select, plus the authenticated server-side fixture suite for valid-once, replay, invalid-token, attempt-limit and expiry. Run repeatable fresh sessions and additional bot strategies; report pass rate by actual challenge type. These deterministic fast puzzles are expected to be easier to automate than Image Select. Do not treat low solver success in a small sample as certification.
3. **Human usability is not yet validated with real users.** Analytics now records actual challenge type, success rate, and the median time from challenge creation to server verification (including network delay). Test across mobile and desktop with real users; target at least 95% completion within two attempts and record accessibility failures. Treat the timing measure as an operational approximation, not pure interaction time.
4. **Run a deployed end-to-end test.** Confirm Auto rotation, random Image Select audits, risk escalation, correct and incorrect answers, expiry, replay, rate limiting, server verification, domain allowlist enforcement, completion timing data, and production customer-backend integration from a real browser session.
5. **Auth security setting.** Supabase Security Advisor previously warned that leaked-password protection is disabled. Enable it before public launch.
6. **Billing still needs a real release check.** Complete a Paddle Sandbox checkout and webhook test, then verify live price IDs and notification secret before enabling live payments.
7. **Production monitoring and retention.** Add alerts for challenge failures/rate limits, validate retention and cleanup of operational tables, and define incident response/support procedures.

## Bot Lab

Open `https://beecaptcha.vercel.app/bot-lab.html` after signing in. The Integration page now also has a direct “Test AI robot” link, and `bot-lab.html?site_id=<site UUID>` preselects the chosen website. A Bot Lab shortcut is included in the sidebars of the dashboard and management pages. Select an owned active Image Select site and run the tests. The built-in browser solver uses COCO-SSD lite MobileNet v2 against the currently supported pilot object classes. It also runs an authenticated server-side fixture suite and one real deliberately-wrong-answer test. The live AI solve rate and server-security score are separate metrics; a green server-security result does not prove that other AI systems cannot solve the image challenge. Results from a real authenticated browser session still need to be collected and reviewed before any paid launch.

## Hosting and secrets

The frontend is static. Never expose the Supabase service-role/secret key, a site Secret Key, Paddle API credentials, or webhook secrets in browser code. Rotate any customer Secret Key previously pasted into chat before real customer use.

## Release decision

Only mark production-ready after the blockers above have measured results and a reviewer has checked the evidence. Passing the automated server-side fixture suite alone is insufficient.
