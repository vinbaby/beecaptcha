# BeeCaptcha / VIN CAPTCHA

BeeCaptcha is a CAPTCHA-as-a-Service project with a customer dashboard, embeddable widget, verification API, usage analytics and Paddle billing.

## Architecture
- **Frontend:** static HTML/CSS/JavaScript at the repository root, hosted on Vercel.
- **Backend:** Supabase project `zjghuovefnbuliovttqa`.
- **`captcha-challenge` v14:** creates short-lived challenges and serves image assets.
- **`widget` v11:** browser custom element for Image Select, Drag & Match and Connect the Dots.
- **`captcha-verify` v5:** verifies a token and answer using the website's server-only Secret Key.
- **Billing:** `paddle-checkout` v3 and `paddle-webhook` v4.
- **Test helpers:** `captcha-test-verify` and `captcha-security-test` require authentication; keep them protected.

## Active challenge types
- `image_select_v1` — select all matching image tiles.
- `drag_drop_v1` — place the puzzle piece into the matching outline.
- `connect_dots_v1` — trace the connected route from A to B.
- `visual_select_v1` and `math_v1` are retired because they are too easy to automate. Never use them as new-site defaults.

## Security rules
1. A Site Key is public; a Secret Key belongs on the website's backend only.
2. Never commit Supabase service-role/secret keys, customer Secret Keys, Paddle API keys or webhook secrets.
3. The widget's `vin-captcha-verified` event only supplies a token. The customer server must call `captcha-verify` before accepting the protected action.
4. Challenges expire after 120 seconds and successful verification is single-use. Preserve database-backed attempt limits and rate limits.
5. `PRODUCTION-READINESS.md` is the source of truth for remaining launch blockers. The current pilot is **not approved for a paid public launch** until the listed tests and measurements are complete.

## Continue in phases
1. Synchronize the dashboard, website settings, docs and pricing with the active CAPTCHA catalog.
2. Run real browser tests for all three challenge types on desktop and mobile, including server verification and domain allowlists.
3. Confirm plan entitlement enforcement for challenge types and usage quotas.
4. Complete Paddle Sandbox checkout/webhook tests before enabling live payments.
5. Measure AI solve rates and human completion/accessibility, improve the image pool, and finish monitoring/retention controls.

Make changes on a feature branch, validate them, and open a PR. Deploying a Supabase Edge Function replaces the active function immediately, so review and verify function code before deployment.
