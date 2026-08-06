# Sprint 8.6 — Public Launch QA

**Phase:** 4 (Public Launch Preparation) · **Depends on:** every prior sprint in this roadmap (7.1–8.5) — this is the final gate before Phase 5. · **Blocks:** Phase 5 (Public Launch) — launch does not proceed until this sprint's Definition of Done is met.
**Companion docs:** `Roadmap.md` (Phase 5's launch-week success criteria, carried forward unchanged), `Sprint 7.5` (the checklist this sprint re-runs as its baseline), original `Phases.md` Phase 1 Definition of Done (the zero-P0-bugs-in-the-core-loop gate, still the single highest-priority invariant in the entire roadmap).

---

## Goal

Final hardening pass confirming the product is genuinely ready for public traffic — re-verifying every prior sprint's Definition of Done rather than trusting it was correctly and permanently satisfied when each sprint shipped.

## Deliverables

1. Full regression pass on the core reading → quiz → unlock loop (unchanged since Phase 1, but re-verified here because it's the one thing that must never regress, and eight sprints' worth of surrounding changes since Phase 3 create real regression risk even to code this sprint doesn't directly touch).
2. Independent re-verification of every Sprint 7.1–8.5 Definition of Done — not a rubber-stamp, an actual re-check against the live, fully-integrated system (things that pass in isolation during their own sprint can regress once everything is combined).
3. A closed-beta-style dry run if founder time allows — even a small (5–10 person) internal/friends-and-family run through signup → Lesson 1 → quiz → dashboard surfaces integration issues that unit/manual testing alone often misses.
4. Final confirmation that the three explicitly-rejected/deferred items from `Product-Review-Report.md §4` (AI Mentor, global leaderboard, lesson paywalling) have not been silently reintroduced anywhere across eight sprints of work — a direct check against `Roadmap.md`'s own "Gaps Identified" item #4.

## UI Changes

None new — this sprint is verification and bug-fixing against existing UI, not new feature UI.

## Backend Changes

Any bugs found during regression are fixed here — this sprint's "deliverable" is functionally a bug-fix sprint gated by the regression checklist, sized to whatever the audit turns up.

## Database Changes

None planned; any found during regression follow the standard migration workflow (`Supabase-Migration-Guide.md`) — no exceptions to that process even under launch-week time pressure.

## API Impact

None planned beyond fixes surfaced by regression testing.

## Testing Checklist

- [ ] Core loop (signup → onboarding → Lesson 1 theory → quiz → Lesson 2 unlocks) — zero P0 bugs, tested end-to-end fresh, not assumed stable from Phase 1.
- [ ] Every Sprint 7.1–8.5 Definition of Done re-verified against the live integrated system.
- [ ] Brand consistency check (Sprint 7.1's grep-based CI rule) still passes after eight sprints of subsequent UI work.
- [ ] Settings 2.0 Danger Zone actions (Sprint 7.2) re-verified for audit-record correctness under real, not just test, conditions.
- [ ] Certificate issuance, QR verification, and LinkedIn sharing (Sprint 7.3) work against production infrastructure.
- [ ] Admin Console (Sprint 7.4) capability parity and auth-guard integrity re-verified.
- [ ] Security/performance budgets (Sprint 7.5) re-run, not assumed still valid.
- [ ] Notification Panel (Sprint 8.4) and its mobile behavior (Sprint 8.5) both verified.
- [ ] Marketing site, SEO, legal pages, and support flow (Sprints 8.1–8.3) all live and correct.
- [ ] `AI Mentor`, global leaderboard, and lesson paywalling are absent from the codebase and documentation — explicit negative-check, not just an absence-of-evidence assumption.

## Definition of Done

- Zero P0 bugs in the core reading → quiz → unlock loop.
- Every prior sprint's Definition of Done independently re-verified and passing.
- The three explicitly-rejected features remain absent.
- Founder sign-off that the product is ready for Phase 5 launch-channel execution.

## Out of Scope

- New features of any kind — this sprint is exclusively verification and bug-fixing.
- Launch-channel execution itself (Product Hunt submission, Reddit posts, etc.) — that's Phase 5, which begins only after this sprint's gate is passed.

## Risks

- **Time pressure compressing this sprint's thoroughness.** This is explicitly the sprint most likely to get rushed under launch-date pressure — flagged here as the single most important risk in the entire roadmap. `Phases.md`'s original Phase 5 guidance already states the right response if launch-week metrics come in weak post-launch ("diagnose and fix, don't push harder on acquisition into a leaky funnel") — the same discipline applies pre-launch: a compressed QA pass produces exactly the kind of leaky funnel that guidance warns about.

## Future Extensions

None — this sprint's job is to close out Phase 4, not to seed new work.
