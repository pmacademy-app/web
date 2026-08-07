# Sprint 7.6 — Dashboard & Learning Experience

**Phase:** 3 (Product Completion) · **Depends on:** Sprint 7.1 (brand chrome). · **Blocks:** none downstream directly, but should land before Sprint 8.5 (Mobile Experience) since it's the last sprint to meaningfully change learner-facing screen structure before the mobile pass.
**Companion docs:** `../reports/Architecture-Review-Report.md` (no dedicated section — this sprint operationalizes `../product/PRD.md §2`'s existing IA principle, which was never fully enforced in the shipped Dashboard/Progress split), `../design/Design.md §2`, `§3`.

---

## Goal

Formally separate Dashboard ("what should I do next") from Progress ("how have I performed"), removing the duplication that accumulated as both screens grew sprint-by-sprint.

## Deliverables

1. Dashboard audit: catalog every element currently rendered on `/dashboard`, classify each as action-oriented (keep) or performance-oriented (move to Progress or remove if duplicated).
2. Progress audit: same exercise for `/progress`.
3. Dashboard final scope: continue-learning CTA, streak-at-risk state, due-today flashcard count (link to Review Hub), next capstone prompt (if a module is complete and capstone unsubmitted), recent-XP ticker (small, non-dominant — per `Design.md §3.1`'s existing rule that XP feedback should be quick and non-disruptive).
4. Progress final scope: skill radar (still the single most prominent element per `PRD.md §2`'s IA decision — unchanged), XP/level history, streak history (the historical view — Dashboard keeps only the *current/at-risk* streak state, not history), certificate eligibility + earned certificates, badge case.
5. Remove any element found duplicated across both screens during the audit (e.g., if streak count currently renders in full on both screens, Dashboard keeps a compact "current streak" chip and Progress owns the historical chart).

## UI Changes

- Dashboard layout revised to the final scope above — likely a net *reduction* in what's shown, since the audit's purpose is removing duplication, not adding features.
- Progress layout revised similarly — gains anything performance-oriented currently misplaced on Dashboard.
- No new screens; this is a scope/layout sprint on two existing screens.

## Backend Changes

None expected — this sprint reorganizes existing data already surfaced by `lib/skillRadar.ts`, `lib/xp.ts`, `lib/streaks.ts`, etc. (`Architecture.md §6`). If the audit finds a data point rendered on Dashboard that has no existing query path suited to Progress's needs (or vice versa), that's a small, isolated backend change, not a new subsystem.

## Database Changes

None.

## API Impact

None expected beyond possibly relocating which page-level server component calls which existing `lib/` function — no new endpoints, no contract changes.

## Testing Checklist

- [ ] Dashboard audit and Progress audit documents completed and reviewed before any code changes (this sprint's own process, not just its output, matters — cutting straight to implementation risks re-litigating the same ad hoc decisions that caused the duplication in the first place).
- [ ] No single data point (e.g., streak count, XP total) is the primary visual focus of both screens simultaneously after the redesign.
- [ ] Skill radar remains the single most prominent element on Progress (regression check against the existing, correct `PRD.md §2` requirement — this sprint must not accidentally demote it while decluttering).
- [ ] A user with zero completed lessons sees a coherent Dashboard (empty/onboarding state) with no broken references to Progress-only data that hasn't accumulated yet.
- [ ] A user with a complete curriculum (Level 9, all capstones) sees Dashboard correctly reflect "nothing left to do next" rather than a stale continue-learning CTA.

## Definition of Done

- Every element on Dashboard answers "what should I do next"; every element on Progress answers "how have I performed" — verified against the audit documents, not just eyeballed.
- Zero duplicated primary-focus elements between the two screens.
- Skill radar's prominence on Progress is preserved or increased, never decreased.

## Out of Scope

- New gamification mechanics or new data points not already tracked by existing `lib/` modules — this sprint is a reorganization of existing, correctly-computed data, not a new-feature sprint.
- Mobile-specific layout work — covered in Sprint 8.5, which explicitly re-passes every screen shipped through this phase, including this sprint's Dashboard/Progress changes.

## Risks

- **Removing something a user actually relied on, mistaking duplication for redundancy.** Mitigate by keeping the audit documents (deliverable #1/#2) as the record of *why* each element was kept, moved, or removed — if a removal turns out wrong post-launch, the reasoning is traceable and reversible, not lost.
- **Over-correcting Dashboard into something too sparse to feel rewarding.** The Dashboard's job is still to feel like a "return to this every day" screen (`PRD.md §1`'s habit-forming positioning) — action-oriented doesn't mean bare. Balance this against the decluttering goal; if in doubt, keep a compact version of a performance signal on Dashboard (e.g., a small streak chip) rather than stripping all performance context from it.

## Future Extensions

- A "this week" summary card on Dashboard (distinct from the Weekly Recap email, `Notification-Architecture.md §5`) could be a natural post-launch addition once real usage data shows what learners actually check Dashboard for — not scoped now since it would be speculative without that data.
