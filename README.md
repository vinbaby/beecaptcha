# BeeCaptcha / VIN CAPTCHA

A CAPTCHA-as-a-Service project with a customer dashboard, embeddable browser widget, server-side verification API, privacy-aware analytics, and Paddle billing.

## Project map

- Static web app: HTML pages at the repository root, deployed with Vercel.
- Database and API: Supabase project reference `zjghuovefnbuliovttqa`.
- Edge Functions:
  - `captcha-challenge`: creates short-lived challenges and serves challenge image assets.
  - `captcha-verify`: server-side verification; requires the site's Secret Key on the server.
  - `widget`: serves the embeddable custom element.
  - `captcha-test-verify`, `captcha-security-test`: authenticated test helpers; keep protected by authentication.
  - `site-rotate-secret`: rotates a website's Secret Key.
  - `paddle-checkout`, `paddle-webhook`: payment flow and signed webhook processing.
- Main repository: `vinbaby/beecaptcha`; production branch: `main`.

## Active CAPTCHA types

- `image_select_v1` — select all matching images.
- `drag_drop_v1` — drag/tap the piece into a matching outline.
- `connect_dots_v1` — trace a connected path from A to B.
- `visual_select_v1` and `math_v1` are retired because they are too easy to automate. Do not use them as defaults.

## Security rules

1. The public Site Key may be used by the browser.
2. The Secret Key, Supabase service-role/secret keys, Paddle API key and Paddle webhook secret must never be exposed in client-side code or committed to Git.
3. A browser event means a token was produced; it does not establish that the backend accepted the answer. The website's server must call `captcha-verify`.
4. Challenges expire after 120 seconds and successful verification is one-time. Avoid bypassing database-backed rate limits or RLS.
5. Do not describe the service as ready for a paid public launch until the production release gates in `PRODUCTION-READINESS.md` have measurable evidence.

## Suggested implementation phases

1. Keep the database schema and verification contract stable.
2. Align the widget with all active CAPTCHA types and test each one on desktop and mobile.
3. Align website creation/settings, docs, pricing and integration snippets with the active catalog.
4. Validate server-side wrong-answer, replay, expiry, attempt-limit, domain allowlist and rate-limit cases.
5. Validate Paddle sandbox checkout/webhook and a real customer integration.
6. Review production monitoring, retention, accessibility and the release gate before public launch.

## Contributor workflow

Make functional changes on a feature branch, validate them, and open a pull request. Deploy edge-function changes only after review because they begin serving at the public function URL immediately.
