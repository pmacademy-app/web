# Sprint 7.4 — Admin Console Polish

**Phase:** 3 (Product Completion) · **Depends on:** Sprint 7.1 (brand assets in Admin chrome). **Soft dependency:** benefits from Sprint 7.2's audit-record pattern (Users drawer surfaces reset/delete history) but does not block on it. · **Blocks:** Sprint 8.3's Feedback-to-Marketing pipeline needs this sprint's Feedback + Content views to exist first.
**Companion docs:** `Architecture-Review-Report.md §2` (owns the IA decisions this sprint implements), `Notification-Architecture.md §20` (existing Admin Console spec this sprint reorganizes, not replaces).

---

## Goal

Reorganize the Admin Console from its sprint-accreted set of top-level pages into the seven-section IA specified in `Architecture-Review-Report.md §2`, without changing the underlying security model.

## Deliverables

1. New Admin nav: **Overview, Content, Users, Communications, Certificates, Feedback, System.**
2. Merge former "Notifications" and "Emails" top-level views into **Communications** (sub-tabs: Templates, Queue & Health, Broadcasts).
3. Convert `/admin/users/[id]` full-page navigation into a drawer overlay on the Users table.
4. New **Content** view housing Feature Flags (moved from System) + new Marketing Controls (site copy toggles, testimonial visibility — the publish side of the Feedback moderation pipeline).
5. New **Feedback** view: moderation queue for testimonials (approve/edit/publish/reject), sourced from the `feedback.requested` event flow (`Architecture-Review-Report.md §3.3`).
6. **Certificates** view: issue/revoke, verification lookups, Dev Certificate Tools (existing, relocated from wherever they currently live to this dedicated section).
7. **System** view retains: audit log, env/feature-flag *state* (read-only diagnostic, distinct from the editable flags now in Content), cron/queue manual trigger.

## UI Changes

- Full Admin nav restructure — this is the primary deliverable. Every existing Admin capability is retained; none are removed, only relocated per the IA above.
- Users table gains a drawer (slide-over) pattern instead of full-page navigation for inspection — reuses the `AdminDataTable` component kit (`Design.md §10`), adds a drawer variant to it.
- Feedback moderation queue: new `AdminDataTable`-based view with inline approve/edit/reject actions.

## Backend Changes

- No changes to `requireAdminUser` or the proxy middleware (`Architecture.md §7.5`) — security model is explicitly unchanged, only navigation/grouping.
- New `lib/admin/feedback-service.ts` — moderation state transitions (pending → approved/rejected), each action logged via the existing `logAdminAction()` audit function (`Architecture.md §7.5`), no new audit mechanism invented.

## Database Changes

```sql
create table testimonials (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references users(id),
  source_event      text not null,          -- 'lesson_3' | 'module_complete' | 'certificate_complete'
  content           text not null,
  status            text not null default 'pending',  -- 'pending' | 'approved' | 'rejected'
  is_published       boolean not null default false,   -- separate from 'approved' — an admin can approve
                                                        -- but hold publishing for timing (e.g. launch week)
  reviewed_by        uuid references users(id),
  reviewed_at        timestamptz,
  created_at         timestamptz not null default now()
);
```
RLS: user can read/write only their own submission (insert + read own `status`); `is_published = true` rows are publicly readable (for the Marketing site, Sprint 8.1) without auth, matching the existing `is_public` pattern already used for `reflections`/`capstone_submissions` (`Architecture.md §2`). Admin write access via `requireAdminUser`, not RLS bypass.

## API Impact

- New routes: `POST /api/feedback` (learner submits, triggered by the `feedback.requested` in-app prompt), `GET/PATCH /api/admin/feedback/[id]` (moderation actions), `GET /api/testimonials` (public, published-only, for Marketing v2).
- Existing Admin routes (`/api/admin/users/*`, `/api/admin/notifications/*`, `/api/admin/emails/*`) are **regrouped in the frontend nav only** — no route path changes required unless a genuine rename improves clarity (e.g., consolidating `/api/admin/notifications` and `/api/admin/emails` under `/api/admin/communications/*` is a nice-to-have, not required for this sprint's DoD).

## Testing Checklist

- [ ] Every Admin capability that existed before this sprint is reachable after the restructure (a manual capability inventory pass — screenshot old nav, screenshot new nav, cross-check).
- [ ] User inspection via the drawer preserves all data previously shown on the full `/admin/users/[id]` page.
- [ ] A learner's feedback submission appears in the Feedback moderation queue with status `pending`.
- [ ] Approving + publishing a testimonial makes it appear via `GET /api/testimonials`; rejecting it does not.
- [ ] RLS policy on `testimonials` correctly restricts a non-admin user to only their own submission and published rows.
- [ ] `requireAdminUser` still gates every Admin API route after the reorganization — no route accidentally left unguarded during the refactor (this is the single highest-severity risk in this sprint).

## Definition of Done

- Admin nav matches the seven-section IA in `Architecture-Review-Report.md §2` exactly.
- No duplicate top-level nav items for the same subsystem (verifies the Product-Review-Report §1.1 simplification actually shipped).
- Feedback moderation → Marketing publishing pipeline works end-to-end.
- Full capability-parity check (testing checklist item 1) passes with zero regressions.

## Out of Scope

- General-purpose CMS (`Product-Review-Report.md §4`) — Content view is scoped to Feature Flags + Marketing Controls only, not a page-builder.
- Automated testimonial sentiment scoring (`Product-Review-Report.md §4`) — moderation is manual.
- Renaming Admin API route paths beyond the optional consolidation noted above — not required, low value relative to risk during this refactor.

## Risks

- **Auth-guard regression during nav refactor.** Highest-severity risk in this sprint — a route accidentally left unguarded while files move around is a real security hole, not a cosmetic bug. Mitigate with the explicit testing-checklist item above, run against every route, not spot-checked.
- **Drawer pattern losing deep-linkability.** The old `/admin/users/[id]` page was linkable (e.g., from an audit log entry). Mitigate by keeping the drawer state reflected in the URL (query param or shallow route), not a pure client-state modal, so existing deep links (from audit logs, support tickets) still work.

## Future Extensions

- Automated testimonial sentiment pre-filtering, if manual moderation becomes a bottleneck post-launch (`Product-Review-Report.md §4`).
- Consolidating Admin API route paths to mirror the new Communications grouping, as a pure refactor once the nav restructure has proven stable in production.
