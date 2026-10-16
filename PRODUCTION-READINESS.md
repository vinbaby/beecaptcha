# BeeCaptcha — Production Release Gate

**Release status: not yet approved for paid public production.** Recent automated tests found a real flaw in the old shape/color challenge. Those challenge types are now disabled for new sites and rejected by the challenge API. This file records what is deployed and what still needs measured evidence before calling the service production-ready.

## Deployed backend

Supabase project: `zjghuovefnbuliovttqa`

- `captcha-challenge` v18: ACTIVE; supports `image_select_v1`, `drag_drop_v1`, and `connect_dots_v1`. The image proxy resolves Wikimedia Commons file names through the MediaWiki imageinfo API, caches resolved thumbnail candidates for reuse, falls back to the original Commons file URL, and restricts final image hosts and response size. Image Select avoids repeating the last two target categories when other eligible categories exist. Stable asset URLs include the selected site ID so browser/CDN image caching can work between challenges.
- `widget` v15: ACTIVE; implements Image Select, Drag & Drop, and Connect Dots interactions and emits a short-lived verification token for server-side checking. Image Select loads tiles with a 220ms stagger, retries failed images twice, and disables verification until all tiles load. “New challenge” now immediately requests a fresh challenge instead of only returning to the initial button.
- `captcha-verify` v5: ACTIVE; validates the site secret, challenge answer and token through the database verification RPC.
- `captcha-test-verify` v1: authenticated live answer check for the dashboard.
- `captcha-security-test` v1: authenticated server-side fixture checks for correct answer, one-time use, invalid tokens, attempt limits, and expiry.
- `site-rotate-secret` v3; `paddle-checkout` v3; `paddle-webhook` v4.

## Verification evidence — 2026-10-16

- The Postgres verification RPC regression suite previously passed for correct-answer acceptance once, replay rejection, wrong-token rejection without consuming a challenge, five-attempt lockout, and expiry rejection.
- The temporary regression rows were removed; a follow-up query reported zero leftover rows.
- `captcha-challenge` v18 and `widget` v15 deployments returned ACTIVE. Supabase edge logs from the previous implementation confirmed multiple image-proxy GET requests returning HTTP 502 while a smaller number returned 200, matching the reported partial image rendering. The active v18 source adds cached thumbnail resolution/fallback; widget v14 staggers image requests, retries each image up to two times, blocks verification when any tile failed, and immediately requests a new challenge on refresh. Source and deployment checks passed, but all nine images have not yet been verified in a real browser after this latest change.
- A full live browser end-to-end run was not completed in this update. In particular, verify that all nine Wikimedia thumbnails load in the production browser after this change; if any fail, use the new in-widget status and refresh behavior to identify the remaining failures. Human completion rate and statistical AI solve rate also remain unverified release-gate items.

## Controls now implemented

- Challenge answer is stored as a hash; the browser receives tile IDs and image URLs, not the correct answer or labels.
- Challenges expire after 120 seconds and a successful token is single-use.
- Five incorrect answers consume the challenge. Empty answers are treated as wrong answers.
- The internal verification RPC is executable only by `service_role`, not by `anon` or `authenticated`.
- Challenge request quotas are reserved atomically in Postgres: 20 per site/IP per minute and 120 per site per minute. Only an IP hash is stored in the limiter table.
- The limiter prefers Cloudflare/proxy IP headers and hashes the resulting value. Verify a trustworthy client IP header in deployed logs; if the hosting path does not provide one, do not rely on the per-IP quota until corrected.
- New sites default to Image Select. Existing test sites were migrated to it.

## Known gaps — block the public paid launch until resolved

1. **Image pool is still very small.** The active pilot pool currently has 16 distinct Wikimedia Commons images: four per class (bicycle, bus, car, and traffic light), each recorded as CC0 1.0 with source page/author metadata. The prior Unsplash rows have been disabled because the Unsplash license restricts compiling images to replicate a similar or competing service. Expand and visually quality-review the pool substantially (target at least 30 distinct images per class), verify each image loads and depicts the label unambiguously, review trademarks/privacy risks, then preferably mirror licensed files to first-party storage with provenance retained. Do not launch publicly based on this four-per-class pilot set.
2. **AI vision benchmark is implemented; results are still required.** Bot Lab loads a pinned TensorFlow.js + COCO-SSD lite MobileNet v2 model in the browser, runs up to five real image-selection challenges, submits each prediction once to the server verifier, and separately runs the authenticated server-side fixture suite for valid-once, replay, invalid-token, attempt-limit and expiry behavior. Collect repeatable results across fresh runs and additional solver strategies; document solve rate by CAPTCHA category. A single model and five rounds are not enough for certification. Do not infer resistance from “not measured”.
3. **Human usability is not measured.** Test across mobile and desktop with real users. Release target: at least 95% human completion within two attempts, while recording median completion time and accessibility failures. If the target is missed, improve the UX before launch.
4. **Run a deployed end-to-end test.** Confirm challenge creation, correct and incorrect answers, expiry, replay, rate limiting, server verification, domain allowlist enforcement, and production customer-backend integration from a real browser session.
5. **Auth security setting.** Supabase Security Advisor previously warned that leaked-password protection is disabled. Enable it before public launch.
6. **Billing still needs a real release check.** Complete a Paddle Sandbox checkout and webhook test, then verify live price IDs and notification secret before enabling live payments.
7. **Production monitoring and retention.** Add alerts for challenge failures/rate limits, validate retention and cleanup of operational tables, and define incident response/support procedures.

## Bot Lab

Open `https://beecaptcha.vercel.app/bot-lab.html` after signing in. The Integration page now also has a direct “Test AI robot” link, and `bot-lab.html?site_id=<site UUID>` preselects the chosen website. A Bot Lab shortcut is included in the sidebars of the dashboard and management pages. Select an owned active Image Select site and run the tests. The built-in browser solver uses COCO-SSD lite MobileNet v2 against the currently supported pilot object classes. It also runs an authenticated server-side fixture suite and one real deliberately-wrong-answer test. The live AI solve rate and server-security score are separate metrics; a green server-security result does not prove that other AI systems cannot solve the image challenge. Results from a real authenticated browser session still need to be collected and reviewed before any paid launch.

## Hosting and secrets

The frontend is static. Never expose the Supabase service-role/secret key, a site Secret Key, Paddle API credentials, or webhook secrets in browser code. Rotate any customer Secret Key previously pasted into chat before real customer use.

## Release decision

Only mark production-ready after the blockers above have measured results and a reviewer has checked the evidence. Passing the automated server-side fixture suite alone is insufficient.
