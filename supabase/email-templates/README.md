# DriftGrid Supabase email templates

Branded HTML templates for the auth emails Supabase sends (signup confirmation, password reset, magic link). Source-of-truth lives here so the look stays in version control; Supabase's hosted dashboard is where they actually get rendered.

## Files

| Template | When it fires |
| -------- | ------------- |
| `confirm-signup.html` | New user signs up (only sent if "Confirm email" is on in Supabase Auth) |
| `reset-password.html` | User hits `/forgot-password` |
| `magic-link.html` | Magic-link auth — currently unused by the app, kept ready for if/when we enable it |

## How to apply

These are Supabase's hosted email templates — they're configured per-project in the dashboard, **not deployable from this repo**. For each file:

1. Go to **Supabase Dashboard → Authentication → Email Templates**
2. Pick the template (e.g. "Confirm signup")
3. Set the Subject:
   - Confirm signup: `Confirm your DriftGrid account`
   - Reset password: `Reset your DriftGrid password`
   - Magic link: `Your DriftGrid sign-in link`
4. Paste the file contents into the **Message** field (overwrites the default)
5. Save

Re-do this for each of the three templates. The link variables (`{{ .ConfirmationURL }}`, `{{ .Email }}`) are server-side and don't need changes.

## The "From" address — separate config

These templates only control the email **body**. The sender address (e.g. `noreply@driftgrid.ai` vs. Supabase's default `noreply@mail.app.supabase.io`) is configured separately:

- **Default**: Supabase sends from its own domain. Body says DriftGrid but the From header doesn't.
- **Branded**: requires setting up custom SMTP under **Dashboard → Project Settings → Authentication → SMTP Settings**. Common providers: Resend, Postmark, SendGrid, AWS SES, Loops.
  - You'll need: SMTP host, port, username, password, and a verified `driftgrid.ai` sender (DKIM + SPF DNS records).
  - Once configured, the From shows `noreply@driftgrid.ai` (or whatever you set).

If you want me to wire up custom SMTP next: give me the provider you want and I can write the DNS/setup steps.

## Site URL — also separate config

Supabase uses the **Site URL** setting (Dashboard → Authentication → URL Configuration) for the host portion of `{{ .ConfirmationURL }}`. Make sure it's set to `https://driftgrid.ai` for production. The redirect path is controlled by the `emailRedirectTo` option passed in code (see `app/login/page.tsx` and `app/connect/page.tsx`).

## Verifying the change

After pasting + saving, sign up with a real email address against production (or trigger a password reset). The email body should now show the DriftGrid wordmark, dark CTA, and footer links. If you see the default Supabase template, the paste didn't save or you're viewing an old email.
