# Sprint 8.5 — Mobile Experience

**Phase:** 4 (Public Launch Preparation) · **Depends on:** Sprints 7.2, 7.3, 7.4, 7.6, 8.1, 8.4 (every screen this sprint re-passes must exist first). · **Blocks:** Sprint 8.6 (Public Launch QA's final regression assumes mobile is already verified, not discovered late).
**Companion docs:** `../product/PRD.md §6` (explicit non-goal: no native app — this is a responsive-web verification sprint, not a new platform build), `../design/Design.md §4` (existing performance/accessibility budget, re-verified here at mobile viewports specifically).

---

## Goal

Verify and polish the responsive experience across every surface shipped or changed in Sprints 7.1–8.4, since none of those sprints had a dedicated mobile-viewport testing pass baked into their own Definition of Done beyond a light spot-check.

## Deliverables

1. Mobile-viewport pass on: Settings 2.0 (all five sections + Danger Zone confirmation dialogs), Certificate 2.0 views (detail view, share flow — PDF export itself is not viewport-dependent), Admin Console (lower priority — admin usage skews desktop, but the redesigned nav from Sprint 7.4 must not be unusable on mobile for an admin checking something urgently), Dashboard/Progress (post-7.6 split), Marketing v2 (post-8.1), Notification Panel (post-8.4 — this is the one item in this sprint with a real open decision, see below).
2. **Notification Panel mobile behavior decision, specified explicitly:** full-screen takeover on small viewports vs. a bottom-sheet vs. the same slide-over scaled down. Recommendation: full-screen takeover below a defined breakpoint (consistent with how Linear/Slack/GitHub's own mobile web experiences handle this pattern) — a slide-over panel narrow enough to coexist with a mobile viewport's main content usually isn't, so don't force the desktop pattern down unchanged.
3. Any responsive-layout bugs found are fixed in this sprint, not just logged (this is a polish sprint with real fixes as its deliverable, not just an audit).

## UI Changes

- No new screens or features — every change in this sprint is a responsive-layout fix to something that already exists from an earlier sprint.

## Backend Changes

None.

## Database Changes

None.

## API Impact

None.

## Testing Checklist

- [ ] Every screen in the deliverable list tested at a real mobile viewport width (not just browser dev-tools resize — at least spot-checked on an actual device or device emulator with touch input, since hover-dependent interactions are a common desktop-only bug source).
- [ ] Danger Zone confirmation dialogs (Sprint 7.2) are fully usable on mobile — typed-confirmation input doesn't get obscured by the mobile keyboard.
- [ ] Notification Panel's mobile behavior matches the decision made in Deliverable #2 and doesn't trap focus or block navigation.
- [ ] Admin Console nav (Sprint 7.4) is at minimum usable (not necessarily optimized) on mobile for urgent admin actions.
- [ ] WCAG AA and performance budgets (`Sprint 7.5`'s checklist) re-verified specifically at mobile viewport widths, not just desktop — mobile Lighthouse scores are commonly worse than desktop and must independently meet the ≥90 target.

## Definition of Done

- Every screen shipped or changed in Sprints 7.1–8.4 is verified and, where needed, fixed for mobile responsiveness.
- The Notification Panel's mobile interaction pattern is explicitly decided and implemented, not left ambiguous.
- Mobile-specific Lighthouse/axe results recorded, following the same pass/fail discipline established in `Sprint 7.5`.

## Out of Scope

- Any native app work (iOS/Android) — explicitly excluded by `PRD.md §6` as a permanent v1 non-goal, unaffected by this sprint's name.
- New mobile-only features (e.g., swipe gestures not present on desktop) — this sprint verifies and polishes the existing responsive design system, it doesn't add mobile-exclusive interaction patterns.

## Risks

- **Treating "responsive CSS already exists" as equivalent to "verified mobile-good."** The existing design system (`Design.md`) was built mobile-responsive from the start per its own stated direction, but five sprints' worth of new UI (Settings, Certificates, Admin nav, Dashboard/Progress split, Notification Panel) shipped without a dedicated mobile pass each — this sprint exists precisely because that gap compounds if left unaddressed until launch week.

## Future Extensions

- If usage data post-launch shows a meaningful mobile-web user base with specific friction points, a follow-up mobile-polish sprint informed by real behavioral data (not speculation) would be the right next step — not scoped now.
