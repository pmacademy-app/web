# Google sign-in / sign-up: plan

Branch: `fix/phase1-stop-the-bleeding` (implement here, in a separate session).
Status: PLAN ONLY, nothing implemented.

## Owner decisions (2026-10-20)
- Same verified email across password and Google: **merge** into one account (Supabase default auto-link).
- Consent UX: see "Consent design" below. Recommended: keep checkboxes on `/signup`, gate the Google button on them, plus a post-OAuth consent gate for new users arriving from `/login`.

## Codebase facts (verified)
- Session = httpOnly cookies `sb-access-token` / `sb-refresh-token`, written only by `lib/auth/session-cookies.ts#setSessionCookies`. No browser Supabase session.
- `app/api/auth/callback/route.ts` already handles `?code=` (`exchangeCodeForSession` -> `ensureUserProfile` -> `redeemPendingReferral` -> `setSessionCookies`). It uses a fresh service-role client, so it has **no PKCE verifier**. This is the main blocker.
- `lib/auth.ts#ensureUserProfile` already reads `app_metadata.provider` and Google `full_name`. Consent is `null` for OAuth today (`lib/legal/consent.ts`).
- Signup form (`app/(auth)/signup/page.tsx`) has TWO required boxes (Terms+Privacy, and 18+ per DPDP; `MINIMUM_SIGNUP_AGE = 18`) plus a Turnstile widget. Google must not bypass either obligation.
- `proxy.ts`: `/api/auth/*` is public/exempt; callback is excluded from the proxy matcher.

## Consent design (recommendation)
Industry norm for social buttons is notice text ("By continuing you agree..."), but this repo's Sept 2026 audit made recorded consent + 18+ attestation a hard requirement, so notice-only is not enough.
1. `/signup`: move the two checkboxes ABOVE both methods. Email form and Google button are both disabled/blocked until both are ticked. Google button click passes `terms=1&age=1` to the start route.
2. `/login`: no checkboxes (returning users). Show small text under the button: "New here? You'll confirm our Terms and age on the next step."
3. Consent gate for any Google user without a consent record (new user who clicked Google on `/login`, or on a flow that skipped checkboxes): callback creates the session, then redirects to `/signup/complete-consent` (both checkboxes, server action calls `buildConsentRecord()` and updates `users`). Until done, the proxy keeps them off `/dashboard` etc. If they decline: sign out and delete the just-created profile/auth user.
4. Consent timestamp and versions always come from the server (`buildConsentRecord`), never from the client.

## Phase 1: Google OAuth (this branch)

### 0. Manual setup (owner, dashboards)
- Google Cloud: OAuth consent screen (app name, support email, domain `prodily.app`, scopes `openid email profile`), publish to Production. Credentials -> OAuth client ID (Web). Authorized redirect URI: `https://<project>.supabase.co/auth/v1/callback`. JS origins: `https://prodily.app`, `http://localhost:3000`.
- Supabase: Auth -> Providers -> Google: enable, paste client ID/secret. URL Configuration: Site URL `https://prodily.app`; redirect URLs `https://prodily.app/api/auth/callback`, `http://localhost:3000/api/auth/callback`, plus preview domains.
- Supabase Auth: confirm "allow new users to sign up" is on and automatic linking by verified email is on (merge decision).
- Vercel env: `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true` (Preview first, Production last). No Google secrets in the Next app.

### 1. Env / config
- Add `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=false` to `apps/web/.env.example` (ship dark).
- Optional local: `[auth.external.google]` in `supabase/config.toml` using `env(GOOGLE_CLIENT_ID)` / `env(GOOGLE_CLIENT_SECRET)`.

### 2. PKCE helper `lib/auth/oauth-pkce.ts`
- Cookie `sb-pkce-verifier`: httpOnly, sameSite lax, secure in prod, path `/api/auth`, maxAge 600. Define name/options in one place, next to `session-cookies.ts`.
- Factory returning an anon Supabase client (`flowType: 'pkce'`, `persistSession: false`) whose custom `storage` reads/writes only the verifier key (start: capture to cookie; callback: read from cookie).

### 3. Start route `app/api/auth/google/route.ts` (GET)
- `withRoute`, actor `anonymous`, operation `auth.google.start`; IP rate limit via `evaluatePersistentRateLimit` (fail closed, like login).
- 404 when the flag is off.
- Validate `next` (same-origin path only, default `/dashboard`); read optional `terms=1&age=1` -> store a short-lived signed consent cookie (or put in `state` query on `redirectTo`) so the callback can record consent server-side.
- Optional `ref` (referral code) carried the same way.
- `signInWithOAuth({ provider: 'google', options: { redirectTo: <SITE_URL>/api/auth/callback?next=..., skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } } })`, set verifier cookie, 302 to `data.url`.

### 4. Callback changes `app/api/auth/callback/route.ts` (code branch only)
- Exchange with the PKCE client reading `sb-pkce-verifier`; always clear that cookie.
- Handle `?error=` / `error_description` from provider (user cancelled) -> `/login?error=oauth_cancelled`.
- Failed exchange -> `/login?error=oauth_failed` (today it falls through silently).
- After exchange: `ensureUserProfile` with consent from the signed cookie if present; if profile has no consent, redirect to `/signup/complete-consent` instead of `next`.
- Keep `redeemPendingReferral`, `setSessionCookies`, and the same-origin `next` check.
- Mirror password-login abuse/session behavior: disposable-email blocklist for newly created users (`b5-abuse-controls`, `incident-2026-09-09-signup-abuse`), and whatever single-session dedup `/api/auth/login` applies (`b13a`, `sessionForClient`). Read those before coding.

### 5. Consent gate page
- `app/(auth)/signup/complete-consent/page.tsx` + server action; reuse the checkbox markup/copy from signup (extract a shared `<LegalConsentFields>` component so the two cannot drift).
- Proxy: authenticated user with null `terms_accepted_at` -> redirect here (exempt `/api/auth/*`, logout, legal pages). Careful with legacy password accounts that also have null consent: scope the gate to `auth_provider = 'google'` only, or the gate would trap them.

### 6. UI
- New `components/auth/GoogleButton.tsx` (official "G" mark, Google brand guidelines, full-width, plain anchor to `/api/auth/google`). Hidden if flag off.
- `login/page.tsx`: button + "or" divider + notice text; surface `?error=` messages.
- `signup/page.tsx`: reorder consent boxes above methods; button disabled until both ticked; Turnstile stays on the email path only (Google is its own bot gate; rate limit covers the start route).
- Do NOT add to `/admin/login`.

### 7. Side effects to handle
- Settings: change-password / change-email assume a password. For Google-only accounts show "Managed by Google / set a password" instead of failing. Check `app/api/settings/security/*`.
- Docs: `docs/SECURITY.md`, `docs/DEPLOYMENT.md` (flag + dashboard steps), privacy page (Google sign-in, data received: email, name, avatar).
- CSP: allow redirect to `accounts.google.com` if `form-action`/`navigate-to` is set.

### 8. Tests (vitest, focused only; don't run full suite or `next build`, see memory)
- Start route: flag off -> 404; sets verifier cookie; rejects off-origin `next`; rate-limited.
- Callback: success sets session cookies and clears verifier; missing/invalid verifier -> `/login?error=oauth_failed`; provider `error=` handled; consent present vs absent routing.
- Consent gate: accepting writes server-side record/versions; declining signs out.
- UI: button hidden when flag off; signup button disabled until both boxes ticked.
- Update tests that enumerate auth routes (`platform-behavior`, `legal-consent-and-cookie-gate`, `production-remediation-invariants`) if they break.
- Verify: `npx tsc --noEmit` + targeted vitest files.

### 9. Manual QA (same browser start to end; verifier cookie is per-browser)
- New Google user from `/signup` (consent recorded), from `/login` (lands on consent gate).
- Existing password user signs in with Google -> merged, same profile.
- Cancel at Google screen; expired/reused code; logout then re-login.

### 10. Rollout
- Merge with flag OFF, test on preview, then flip flag ON in Production.

## Open items
- Referral-code transport (cookie vs `state`): decide during step 3.
- Whether a declined consent should delete the auth user or just sign out and leave an orphan.
