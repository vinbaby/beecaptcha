# BeeCaptcha — Production Readiness (v9)

## Current backend
- Supabase project: `zjghuovefnbuliovttqa`
- Edge Functions: `captcha-challenge` v6, `captcha-verify` v5, `widget` v6, `site-rotate-secret` v3, `paddle-checkout` v3, `paddle-webhook` v4.
- Paddle checkout is configured server-side; the browser never receives `PADDLE_API_KEY`, webhook secrets, or site secret keys.

## Browser/public checks
Open `health.html` after hosting the static package. It checks:
1. Widget bundle reachability.
2. Public challenge creation with the internal test site key.
3. Read access to active CAPTCHA types through the Supabase client.

## Paddle before production
1. Keep Sandbox for end-to-end testing.
2. Create/configure a Paddle notification destination pointing to:
   `https://zjghuovefnbuliovttqa.supabase.co/functions/v1/paddle-webhook`
3. Put the destination secret in the Supabase Edge Function secret `PADDLE_WEBHOOK_SECRET`.
4. Confirm the Pro and Business price IDs are the live IDs before setting `PADDLE_ENVIRONMENT=live`.
5. Run a real Sandbox checkout and verify a `billing_webhook_events` row is created and `billing_subscriptions` updates.

## Supabase security
The latest Security Advisor reports one warning: leaked-password protection is disabled. Enable leaked-password protection in Supabase Auth before production launch.

## Hosting
This is a static frontend. It can be deployed to any static host that serves HTML/CSS/JS and supports SPA-style 404 handling where needed. Do not inject server-only Paddle secrets or Supabase secret/service-role keys into this package.

## Remaining release gate
A browser-based live HTTP smoke test must be run from the deployed site because this build runtime cannot resolve the Supabase function domain. The included `health.html` is designed for that check.
