# Resend SMTP for Supabase Auth Emails

Configure Resend as the SMTP provider for Supabase Auth so the welcome,
confirmation, and password-reset emails actually deliver instead of getting
rate-limited or flagged as spam by Supabase's default sender.

This is a one-time backend setup. Once done, no iOS code needs to change —
the existing `signUp`, `resetPassword`, and Apple Sign-In flows just work.

---

## Prerequisites

- Supabase project (`elpdnxvtulbqgnsrbstx`)
- Resend account (https://resend.com) — free tier allows 100 emails/day, 3k/mo
- Access to DNS records for `helloparade.app`

---

## Step 1 — Create a Resend account + verify domain

1. Sign up at https://resend.com
2. Add a domain: Dashboard → Domains → Add Domain → `helloparade.app`
3. Resend shows DNS records to add. Three types:
   - **SPF**: `TXT @` → `v=spf1 include:amazonses.com ~all`
   - **DKIM**: 3 `CNAME` records → Resend gives the specific subdomain values
   - **DMARC** (optional): `TXT _dmarc` → `v=DMARC1; p=none;`
4. Add these to your DNS provider (Cloudflare, Route 53, etc.). Propagation
   usually takes 5–15 minutes.
5. Click **Verify** in Resend. Wait until status shows ✅ Verified.

---

## Step 2 — Generate a Resend API key

1. Resend Dashboard → API Keys → Create API Key
2. Name: `supabase-auth-prod`
3. Permission: **Sending access** (the default scope is fine)
4. Domain: select `helloparade.app`
5. Copy the key (`re_xxxxxxx`) — you won't see it again

---

## Step 3 — Configure Supabase to use Resend SMTP

1. Supabase Dashboard → Project Settings → Auth → SMTP Settings
2. Toggle **Enable Custom SMTP** ON
3. Fill in:
   | Field | Value |
   |---|---|
   | Sender email | `noreply@helloparade.app` (or `hello@…`) |
   | Sender name | `Parade` |
   | Host | `smtp.resend.com` |
   | Port | `465` |
   | Username | `resend` (literally the string "resend") |
   | Password | the `re_xxxxxxx` API key from Step 2 |
4. Click **Save**
5. Click **Send Test Email** at the bottom — confirm it arrives

---

## Step 4 — Update Auth URL configuration for deep links

Supabase needs to allow `parade://` and `https://helloparade.app/*` URLs in
its redirect whitelist so the iOS app can deep-link from email-tap.

1. Supabase Dashboard → Authentication → URL Configuration
2. **Site URL**: `https://helloparade.app`
3. **Additional Redirect URLs** (one per line):
   ```
   parade://
   parade://reset-password
   parade://auth-callback
   https://helloparade.app
   https://helloparade.app/reset-password
   https://helloparade.app/auth-callback
   exp://*
   ```
   (The `exp://*` line is for Expo Go / dev client. Remove for prod.)
4. Save

---

## Step 5 — Customize email templates (optional but recommended)

Supabase ships generic templates with their logo. To match Parade branding:

1. Authentication → Email Templates
2. Edit each template (Confirm signup, Reset password, Magic link, etc.)
3. Use the HTML template at `docs/email-templates/` in this repo as a starting
   point. Replace the body's `{{ .ConfirmationURL }}` / `{{ .Token }}` etc. as
   Supabase requires.

iOS-relevant URL variables:
- `{{ .ConfirmationURL }}` → the full Supabase verify URL that wraps the
  redirect (this is what the user taps in the email)
- `{{ .RedirectTo }}` → the deep-link URL the iOS app passes (`parade://...`)

---

## How iOS uses these emails

The iOS app's `useAuth.tsx` calls Supabase with:

| Flow | `emailRedirectTo` |
|---|---|
| `signUp` | `Linking.createURL('/')` → `parade://` (or `exp://...` in dev) |
| `resetPassword` | `Linking.createURL('reset-password')` → `parade://reset-password` |

When the user taps a link in the email:
1. The URL points to Supabase: `https://<project>.supabase.co/auth/v1/verify?...&redirect_to=parade://...`
2. Supabase validates the token and redirects to the `parade://` URL
3. iOS opens Parade via the custom URL scheme registered in `app.config.ts`
4. Expo Router handles the deep link and routes to the screen

For this to work end-to-end, **Step 4 above must be complete** — Supabase
won't redirect to a URL that isn't on the whitelist.

---

## Verification

After all 4 (or 5) steps are done:

1. Sign up a new test account in the iOS app
2. Watch for the confirmation email (should arrive within 30s)
3. Sender should show as `Parade <noreply@helloparade.app>` (not Supabase)
4. Tap the confirmation link in Apple Mail on the same device → app should
   open via deep link
5. Test the reset password flow similarly

If the email doesn't arrive:
- Check Resend dashboard → Logs for delivery status
- Check Supabase Dashboard → Authentication → Logs for auth-side errors
- Make sure the DNS records are still verified (sometimes propagation drifts)

If the email arrives but tapping the link doesn't open the app:
- Verify the redirect URL is in the whitelist (Step 4)
- Verify `scheme: 'parade'` in `app.config.ts`
- Try tapping the link in Safari first — should redirect through Supabase
  back to a `parade://` URL the system will offer to open in Parade

---

## Future upgrade: Universal Links

Once you're on TestFlight, consider switching from `parade://` to Universal
Links (`https://helloparade.app/...`). Benefits:
- Apple Mail opens these directly in the app without an intermediate prompt
- Falls back to web if user doesn't have the app installed
- More secure (only the verified app can claim the domain)

Steps:
1. Host an `apple-app-site-association` (AASA) file at
   `https://helloparade.app/.well-known/apple-app-site-association` with:
   ```json
   {
     "applinks": {
       "details": [
         {
           "appIDs": ["9THMCL38AJ.app.parade.ios"],
           "components": [{ "/": "/auth-callback*" }, { "/": "/reset-password*" }]
         }
       ]
     }
   }
   ```
2. Update iOS auth callsites to use `https://helloparade.app/...` instead of
   `Linking.createURL(...)` (or keep both, Apple supports either)
3. The `associatedDomains: ['applinks:helloparade.app']` is already in
   `app.config.ts` — nothing to add there
