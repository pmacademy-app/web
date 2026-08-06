# Sprint 7.5 — Security & Performance

**Phase:** 3 (Product Completion) · **Depends on:** Sprints 7.2–7.4 (new surfaces to audit — Settings, Certificates, Admin). Best run after those, not before, so the audit covers the final surface area rather than a moving target. · **Blocks:** Sprint 8.6 (Public Launch QA reuses this sprint's checklist as its re-verification baseline).
**Companion docs:** `Architecture.md §9` (existing security section this sprint operationalizes into a threat model), `Design.md §4` (existing performance/accessibility budget this sprint verifies against real measurements).

---

## Goal

Produce the two standalone artifacts identified as missing in `Architecture-Review-Report.md §7` — a real threat model and an enforced (not assumed) performance budget — and run them against the current, post-Sprint-7.4 state of the product.

## Deliverables

1. `docs/Security-Threat-Model.md` (new) — covers authentication, authorization/RBAC, middleware, RLS, API validation, Server Actions, secrets handling, rate limiting, security headers, audit logging, with an explicit mitigation stated per threat, not just a list of concerns.
2. `docs/Performance-Budget-Checklist.md` (new) — operationalizes `Design.md §4`'s budget into a per-page-type checklist with a recorded pass/fail result, not an estimate.
3. Real Lighthouse + axe-core audit run against: lesson page, dashboard, Settings (new), Admin Overview (new), a certificate view, and the pre-v2 marketing homepage.
4. Rate-limiting verification pass on every mutation endpoint (progress, XP, flashcard review, capstone submission, settings resets, feedback submission) — confirming each is actually rate-limited, not just documented as should-be.
5. Security headers audit (CSP, HSTS, X-Frame-Options, etc.) verified against the deployed Vercel configuration, not just the intended config.

## UI Changes

None — this sprint produces documentation and verification, not new UI. Any UI-level accessibility fixes discovered during the axe-core pass are logged as follow-up items (see Risks) rather than silently fixed mid-audit, so the audit results reflect a real before/after.

## Backend Changes

- Any rate-limiting gaps discovered are fixed as part of this sprint (this is a genuine backend deliverable, not just documentation) — e.g., if the Settings 2.0 reset endpoints from Sprint 7.2 shipped without rate limiting, that's closed here.
- Security headers configuration (`next.config.js` / Vercel config) updated if the audit finds gaps against the documented intent in `Architecture.md §9`.

## Database Changes

None expected. If the RLS audit (part of the threat model exercise) finds a table missing a policy, that's a hard-stop finding — fixed immediately as a migration, not deferred, per `DO_NOT_CHANGE.md`'s RLS invariant and `IMPLEMENTATION_RULES.md §4.2`'s database-safety rule.

## API Impact

- No new endpoints. Existing endpoints may gain rate-limiting middleware if gaps are found.

## Testing Checklist

- [ ] Every user-owned table has RLS enabled with a verified `user_id = auth.uid()` policy (cross-check against the full table list in `Architecture.md §2`, including `testimonials` added in Sprint 7.4).
- [ ] Every mutation endpoint requires authenticated session derivation, never a client-passed `user_id` (spot-check via a crafted request with a mismatched `user_id`, confirm it's rejected).
- [ ] Every mutation endpoint has rate limiting; verify by exceeding the limit in a test environment and confirming a 429/throttle response.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` does not appear in any client-bundled JavaScript (verify via a production bundle grep, not just code review).
- [ ] Lighthouse performance score ≥ 90 on lesson pages (the existing NFR target, `PRD.md §5`) — measured, not assumed.
- [ ] WCAG AA automated scan (axe-core) passes on all six audited page types; at least one manual screen-reader pass completed on the lesson reading view and the Settings Danger Zone (highest-stakes accessibility surface — destructive actions must be fully operable via screen reader).
- [ ] Security headers present and correctly configured on the deployed (not just local) environment.

## Definition of Done

- Both new documents exist, are internally consistent with `Architecture.md §9` and `Design.md §4` (no contradictions introduced), and every threat/budget item has a recorded, dated verification result.
- Every rate-limiting and RLS gap discovered during the audit is closed, not just logged.
- Lighthouse and axe-core results are attached to the checklist with actual scores, not "should be fine."

## Out of Scope

- Penetration testing by a third party — a real security engagement, if warranted, is a founder decision outside this documentation/architecture pass; this sprint produces the internal threat model that would inform whether that's worth commissioning.
- Performance work beyond what's needed to hit the existing budget — this sprint verifies and closes gaps against the already-documented target, it doesn't raise the target.

## Risks

- **Audit surfaces a real RLS or auth gap.** Given the emphasis on RLS throughout the existing docs, this is unlikely but must be treated as a hard-stop, ship-blocking finding if it occurs — not something deferred to a future sprint.
- **Accessibility findings scoped larger than this sprint's time budget.** Mitigate by fixing anything on the audited page types now, and explicitly logging (in `KNOWN_ISSUES.md`, per its existing purpose) anything found on pages outside this sprint's six-page audit scope, with a plan to close it before Sprint 8.6's final QA gate — not silently carried past launch.

## Future Extensions

- Recurring automated Lighthouse/axe CI checks on every PR touching a page-level component, once the manual baseline from this sprint exists to compare against.
- Formal third-party security review, funded once monetization (`PRD.md §10`) makes the cost justifiable.
