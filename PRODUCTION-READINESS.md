# BeeCaptcha — Production Release Gate

**Release status: not yet approved for paid public production.** Recent automated tests found a real flaw in the old shape/color challenge. Those challenge types are now disabled for new sites and rejected by the challenge API. This file records what is deployed and what still needs measured evidence before calling the service production-ready.

## Deployed backend

Supabase project: `zjghuovefnbuliovttqa`

- `captcha-challenge` v11: active; returns image-selection challenges only. Weak `visual_select_v1` and `math_v1` types are retired and rejected.
- `captcha-verify` v5; `widget` v9.
- `captcha-test-verify` v1: authenticated live answer check for the dashboard.
- `captcha-security-test` v1: authenticated server-side fixture checks for correct answer, one-time use, invalid tokens, attempt limits, and expiry.
- `site-rotate-secret` v3; `paddle-checkout` v3; `paddle-webhook` v4.

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
2. **No AI vision benchmark yet.** Bot Lab's built-in no-AI robot can detect deterministic metadata weaknesses and run server-side security checks, but it does not test an AI vision model. Benchmark a documented sample of challenges against at least one representative vision-capable automated solver; report sample size and solve rate. Do not infer resistance from “not measured”.
3. **Human usability is not measured.** Test across mobile and desktop with real users. Release target: at least 95% human completion within two attempts, while recording median completion time and accessibility failures. If the target is missed, improve the UX before launch.
4. **Run a deployed end-to-end test.** Confirm challenge creation, correct and incorrect answers, expiry, replay, rate limiting, server verification, domain allowlist enforcement, and production customer-backend integration from a real browser session.
5. **Auth security setting.** Supabase Security Advisor previously warned that leaked-password protection is disabled. Enable it before public launch.
6. **Billing still needs a real release check.** Complete a Paddle Sandbox checkout and webhook test, then verify live price IDs and notification secret before enabling live payments.
7. **Production monitoring and retention.** Add alerts for challenge failures/rate limits, validate retention and cleanup of operational tables, and define incident response/support procedures.

## Bot Lab

Open `https://beecaptcha.vercel.app/bot-lab.html` after signing in. Select an owned active site and run the tests. The live solver score and server-security score are separate metrics; a green server-security result does not prove that AI cannot solve the image challenge.

## Hosting and secrets

The frontend is static. Never expose the Supabase service-role/secret key, a site Secret Key, Paddle API credentials, or webhook secrets in browser code. Rotate any customer Secret Key previously pasted into chat before real customer use.

## Release decision

Only mark production-ready after the blockers above have measured results and a reviewer has checked the evidence. Passing the automated server-side fixture suite alone is insufficient.
