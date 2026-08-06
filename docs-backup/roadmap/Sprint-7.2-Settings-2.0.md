# Sprint 7.2 — Settings 2.0

**Phase:** 3 (Product Completion) · **Depends on:** Sprint 7.1 (`BrandLogo`/`BRAND` used in confirmation dialogs and account-deletion emails) · **Blocks:** none downstream, but shares the typed-confirmation dialog component with no other sprint — build it here as a reusable primitive since Certificates 2.0 (Sprint 7.3) does not need destructive-confirmation UX, only Settings does.
**Companion docs:** `../reports/Architecture-Review-Report.md §4` (owns the IA and ledger-respecting reset decisions this sprint implements), `../architecture/Notification-Architecture.md §11` (owns the preference model this sprint's Notifications tab wires up to).

---

## Goal

Ship the unified Settings IA — Profile, Security, Portfolio, Notifications, Danger Zone — replacing the current scattered settings surface, with every destructive action treated as a first-class, auditable operation rather than a raw database mutation.

## Deliverables

1. `app/(app)/settings/` restructured into five tabs/sections: Profile, Security, Portfolio, Notifications, Danger Zone.
2. `ConfirmDestructiveAction` dialog component — typed-confirmation pattern (user must type a specific word, e.g. `RESET` or `DELETE`), reused across all seven destructive actions.
3. Six reset actions, each implemented as a ledger-respecting operation, not a raw `DELETE`/`UPDATE`:
   - Reset Progress (per-module or full)
   - Reset XP
   - Reset Flashcards
   - Reset Streak
   - Reset Skill Radar
4. Delete Account flow: full RLS-table cascade, public portfolio URL revocation, certificate-profile delinking (certificate record retained for audit/legal purposes — see Sprint 7.3), `account.deleted` event fired to drop any in-flight queued notifications.
5. Notifications tab wired 1:1 to the preference model already specified in `Notification-Architecture.md §11` — this sprint is the UI for an already-designed backend, not a new preference system.
6. Portfolio settings bug-class regression test (the `getAuthenticatedUserFromRequest` destructuring bug fixed in the Stabilization Sprint) added as a permanent test case so this class of bug can't silently reoccur.

## UI Changes

- New Settings navigation (tabs or left-rail sub-nav, per `Design.md`'s pattern for the learner shell).
- Danger Zone is visually distinct (per `Design.md`'s semantic color system — this is exactly the kind of state that warrants the destructive/warning color token, not decorative red).
- Each reset action shows, before the confirmation dialog, a plain-language summary of exactly what will be lost (e.g., "This will clear your XP total and remove all XP history. Your lesson completion and streak are not affected.") — no vague "are you sure?" with no specifics.

## Backend Changes

- New `lib/settings-service.ts` — owns all reset/delete orchestration, called from thin API routes (`Rules.md §3.3`'s component/logic split applies to services too: routes stay thin, logic lives in `lib/`).
- Each reset writes an explicit audit record:
  - XP reset → large negative `xp_events` row, `source_type = 'admin_reset'` (or `user_reset` if self-service — see Risks below for the naming decision this requires), preserving the append-only invariant (`Architecture.md §0`/`DO_NOT_CHANGE.md §3.2`).
  - Progress/Flashcards/Skill-Radar/Streak resets follow the same pattern: an explicit state-change record, never a silent row deletion, so Support has a real trail if a user disputes an accidental reset.
- Delete Account cascades through every RLS-protected table listed in `Architecture.md §2`, in a single transaction where the underlying Supabase/Postgres setup allows it — partial deletion is a worse failure mode than a failed, retryable, all-or-nothing delete.

## Database Changes

- No new tables. Existing `xp_events` `source_type` enum extended to include `user_reset` (self-service, distinct from `admin_reset` which the Admin Console's future manual-override tooling would use) — additive, non-breaking.
- No changes to any frozen-scope table structure (`Architecture-Review-Report.md §1`).

## API Impact

- New routes: `POST /api/settings/reset/{progress|xp|flashcards|streak|skill-radar}`, `POST /api/settings/delete-account`.
- Every reset/delete route re-derives the user from the authenticated session (never trusts a client-passed `user_id`), consistent with `Architecture.md §7`'s existing API design principle.

## Testing Checklist

- [ ] Each of the six reset actions produces exactly one new audit-trail record and leaves every other gamification dimension untouched (e.g., resetting XP does not affect streak).
- [ ] Delete Account removes/anonymizes rows across every RLS-protected table; public portfolio URL 404s afterward; issued certificates still resolve at `/verify/[certificateId]` but no longer link to a live public profile.
- [ ] `account.deleted` event correctly drops any notifications already queued for that user (verify against the queue, not just that new notifications stop).
- [ ] All seven destructive actions require exact-match typed confirmation; a near-miss (wrong case, extra whitespace) is rejected, not silently accepted.
- [ ] Portfolio settings regression test (the specific Stabilization Sprint bug) passes.
- [ ] Notification preference changes in Settings are reflected in actual delivery behavior within one send cycle (verify via a real test notification, not just that the preference row updated).

## Definition of Done

- All items in `Architecture-Review-Report.md §4` are implemented as specified.
- No reset or delete path performs a raw `DELETE`/`UPDATE` on gamification state without a corresponding audit record.
- Settings 2.0 is the only settings surface — no orphaned old settings routes left reachable.

## Out of Scope

- Any Admin-side manual override of a user's reset/delete (that's a future Admin Console capability, not required for this sprint — flagged as a candidate for Sprint 7.4 only if time allows, not a hard dependency).
- Data export ("download my data") — not requested in this brief; noted as a plausible future addition alongside Delete Account, not built now.

## Risks

- **`user_reset` vs `admin_reset` source-type ambiguity if Admin gets manual reset tooling later.** Mitigate by reserving the enum value now (see Database Changes) even though Admin-side reset isn't built this sprint — avoids a second migration later.
- **Partial-cascade failure on Delete Account.** Mitigate with transactional deletion where Postgres/Supabase permits it, and a documented manual-recovery runbook (added to `Supabase-Migration-Guide.md`'s operational notes) for the rare case a table needs to be added to the cascade list later — a missed table here is a real, high-severity bug class, not a cosmetic one.

## Future Extensions

- Admin-initiated reset (support tooling) once the Admin Console needs it.
- Data export, if user demand or a legal requirement (e.g., GDPR-style data portability) makes it necessary post-launch.
