# Prodigy PM Academy — Security Threat Model

**Status:** New document (Sprint 7.5 deliverable), operationalizing `Architecture.md §9`'s existing security principles into explicit threats with stated mitigations.
**Companion docs:** `Architecture.md §9`, `DO_NOT_CHANGE.md` (RLS/auth invariants), `Rules.md` (change-management process for anything touching these areas).

---

## 1. Authentication

| Threat | Mitigation | Verified |
|---|---|---|
| Credential stuffing / brute force against email+password login | Supabase Auth's built-in rate limiting on auth endpoints; no custom auth implementation to introduce gaps | Sprint 7.5 audit |
| Session hijacking | Supabase Auth session tokens, httpOnly cookies, standard expiry/refresh handling — no custom session storage | Sprint 7.5 audit |
| OAuth (Google) misconfiguration exposing broader scope than needed | Scope limited to profile/email only; verified against the live Google Cloud Console config, not just intended config | Sprint 7.5 audit |

## 2. Authorization / RBAC

| Threat | Mitigation | Verified |
|---|---|---|
| Non-admin user accessing `/admin/*` routes | Dual-layer guard: proxy middleware (`Architecture.md §1.1`) + server-side `requireAdminUser` on every `/api/admin/*` handler | Sprint 7.5 audit — both layers independently tested |
| Admin nav reorganization (Sprint 7.4) accidentally leaving a route unguarded | Explicit regression test: every pre-existing Admin route re-verified as guarded post-refactor, not assumed carried over correctly | Sprint 7.4 + re-verified Sprint 7.5 and again Sprint 8.6 |
| Privilege escalation via client-supplied role/flag data | `is_admin` check is always server-side against `users.is_admin` / `ADMIN_EMAILS`, never trusts client state | Sprint 7.5 audit |

## 3. Row-Level Security (RLS)

| Threat | Mitigation | Verified |
|---|---|---|
| A user-owned table missing an RLS policy, exposing all users' rows | Every table in `Architecture.md §2` cross-checked for an active `user_id = auth.uid()` policy, including `testimonials` (new Sprint 7.4) | Sprint 7.5 full-table audit |
| `is_public`/`is_published` gated tables (`reflections`, `capstone_submissions`, `testimonials`) leaking non-public rows to unauthenticated readers | Explicit policy tested with an unauthenticated request against a private row (expect rejection) and a public row (expect success) | Sprint 7.5 audit |
| Service-role key misuse bypassing RLS unintentionally | `SUPABASE_SERVICE_ROLE_KEY` confirmed absent from any client-bundled JavaScript via production bundle grep | Sprint 7.5 audit |

## 4. API Validation & Server Actions

| Threat | Mitigation | Verified |
|---|---|---|
| Client-supplied `user_id` used instead of session-derived identity | Every mutation route re-derives the user from the authenticated session, per `Architecture.md §7`'s existing design principle; spot-tested with a crafted mismatched `user_id` payload | Sprint 7.5 audit |
| Malformed/oversized payloads to mutation endpoints (Settings resets, Feedback submission, Certificate actions) | Input validation on every new route introduced this phase (`/api/settings/reset/*`, `/api/feedback`, `/api/admin/feedback/[id]`) | Sprint 7.5 audit |
| Direct manipulation of destructive Settings actions bypassing the typed-confirmation UI | Server-side reset/delete endpoints do not trust that confirmation happened client-side — each still requires a valid authenticated session and operates only on that session's own user, limiting blast radius even if the UI were bypassed | Sprint 7.5 audit |

## 5. Secrets Handling

| Threat | Mitigation | Verified |
|---|---|---|
| Secrets committed to version control | `.env` git-ignored; secrets live in Vercel/Supabase project settings only | Standing practice, reconfirmed Sprint 7.5 |
| Resend/Supabase API keys exposed client-side | Confirmed server-only usage via bundle audit (same pass as §3's service-role-key check) | Sprint 7.5 audit |

## 6. Rate Limiting

| Threat | Mitigation | Verified |
|---|---|---|
| Abuse of XP-granting endpoints (theory-read, quiz-submit) to inflate XP artificially | Existing engagement-verification logic (`lib/xp.ts` dwell-time/scroll-depth thresholds) plus endpoint-level rate limiting | Sprint 7.5 audit — confirmed limits trigger under simulated excess requests |
| Abuse of Settings 2.0 reset/delete endpoints (e.g., scripted repeated resets) | Rate limiting added if found missing during audit — flagged as a genuine backend deliverable of Sprint 7.5, not just documentation | Sprint 7.5 audit + fix |
| Abuse of Feedback submission endpoint (spam testimonials) | Rate limiting per user; moderation queue (Sprint 7.4) is the second line of defense even if a limit is bypassed | Sprint 7.5 audit |
| Support form abuse (`Sprint 8.3`) | Rate limiting on `/api/support` if that route is built (vs. a plain `mailto:` link, which has no server-side attack surface at all) | Sprint 8.3 / re-verified Sprint 7.5's checklist pattern |

## 7. Security Headers

| Threat | Mitigation | Verified |
|---|---|---|
| Clickjacking | `X-Frame-Options` / frame-ancestors CSP directive | Sprint 7.5 audit against deployed Vercel config |
| XSS via injected content (reflections, capstone submissions, testimonials — all user-authored free text) | React's default output-escaping; CSP as defense-in-depth; no `dangerouslySetInnerHTML` on user-authored content anywhere in the codebase (verified, not assumed) | Sprint 7.5 audit |
| Protocol downgrade | HSTS enabled | Sprint 7.5 audit |

## 8. Audit Logging

| Threat | Mitigation | Verified |
|---|---|---|
| Admin actions (role changes, feature-flag toggles, testimonial moderation, manual queue triggers) untraceable after the fact | `logAdminAction()` — existing mechanism, extended (not replaced) to cover Sprint 7.4's new Feedback moderation actions | Sprint 7.5 audit — confirmed new actions are logged, not just old ones |
| Destructive Settings actions (resets, delete) leaving no trace | Ledger-respecting design (`Architecture-Review-Report.md §4`) — every reset is an auditable `xp_events`-style record, Delete Account fires a traceable `account.deleted` event | Sprint 7.2 design + Sprint 7.5 verification |

## 9. Data Privacy

| Threat | Mitigation | Verified |
|---|---|---|
| Google Analytics collecting more PII than intended | IP anonymization configuration verified against live production GA config | Sprint 7.5 / Sprint 8.3 |
| Resend collecting more than transactional-email-necessary data | Minimal-PII configuration, documented in the Privacy Policy (`Sprint 8.3`) matching actual practice | Sprint 8.3 |
| Deleted-account data lingering beyond the cascade | Full RLS-table cascade verified (`Sprint 7.2` testing checklist), including certificate profile-delinking while preserving the certificate record itself for audit/legal purposes | Sprint 7.2 + Sprint 7.5 |

## 10. Residual Risk / Explicitly Not Covered By This Document

- **No third-party penetration test has been performed.** This document is an internal threat model, not a substitute for one. Whether to commission a formal pentest is a founder decision, informed by this document, outside this engagement's scope (`Roadmap.md` Sprint 7.5's Out of Scope).
- **Supply-chain risk (compromised npm dependency)** is not separately modeled here — standard practice (lockfile pinning, Dependabot-style alerts if enabled) applies but isn't a novel decision made in this pass.

---

## Changelog

- v1.0 (2026-08-06) — Initial threat model, Sprint 7.5 deliverable, operationalizing `Architecture.md §9` into explicit threats and mitigations across authentication, authorization, RLS, API validation, secrets, rate limiting, headers, audit logging, and data privacy.
