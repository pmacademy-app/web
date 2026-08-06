# Prodigy PM Academy — Architecture Review Report

**Role:** Principal Software Architect review, ahead of Phase 3.7–Phase 5.
**Companion:** `Documentation-Synchronization-Report.md` (what was stale/contradictory), `Roadmap.md` (the resulting sprint plan), `Product-Review-Report.md` (simplification calls).

---

## 1. What stays frozen, and why (the narrowed §0)

The existing `Architecture.md` froze "core learning infrastructure" wholesale after `v1.0.0-foundation`. That's too broad a brush now that Phase 3.7+ needs to touch Admin, Notifications, Settings, and Certificates. I'm narrowing the freeze to exactly four things, because these four are the ones where a mid-flight change would corrupt user data or force a costly migration — everything else is UI/IA surface that can safely evolve:

| Frozen | Why |
|---|---|
| **Content compiler** (`content-pipeline.md`) | 90 lessons are already compiled and validated against this pipeline; changing the block taxonomy or ID scheme mid-flight risks silently breaking existing `xp_events`/`user_lesson_progress` references. |
| **Block renderer** (`rendering-pipeline.md`) | Same reasoning — the registry contract is what every lesson page depends on. |
| **`lessonId`/`blockId` stable-ID addressing** | This is the entire reason user progress survives content edits. Touching it is a data-migration event, not a refactor. |
| **Append-only XP ledger** | Auditability and anti-gaming guarantees depend on nothing ever writing `users.total_xp` directly. This is a correctness invariant, not a style preference. |

Everything else — Admin IA, notification delivery UX, Settings structure, Certificate design, Marketing site, cross-product Design System — is **explicitly unfrozen** for this phase. This is the single most important architectural call in this pass: it's what makes the rest of the brief buildable without relitigating the freeze on every sprint doc.

**Recommendation:** keep re-freezing subsystems as they stabilize post-launch (e.g., once Certificates 2.0 ships and is verified in production, freeze *that* specific subsystem the same way) rather than leaving everything permanently open. A freeze that's never re-applied is just an unenforced style guide.

---

## 2. Admin Console — redesign decision

**Current state:** `/admin` exists (Sprint 6.4) with RBAC middleware, an `AdminDataTable`/`AdminKpiCard`/`AdminPageHeader`/`AdminStatusBadge` component kit (Sprint 6.4.2), and live operational actions — role toggles, user inspection, queue triggers, feature-flag toggles, test-email sending (Sprint 6.4.3), plus dual-layer auth (proxy middleware + `requireAdminUser` API guard, Sprint 6.4.4).

**Assessment:** the security model is sound and stays as-is (§7.5 of `Architecture.md`, unchanged). The gap is **information architecture**, not capability — the brief's instinct that it "feels like a collection of disconnected pages" is correct given how it grew sprint-by-sprint (Dashboard, Users, Notifications, Emails, System as separate top-level views, each added independently).

**Final IA (locked for `Sprint 7.4`):**

```
/admin
├── Overview          — KPI cards (active users, completion funnel, error rate), system health strip
├── Content            — Feature flags, Marketing Controls (site copy toggles, testimonial approval)
├── Users              — search/filter table → user detail drawer (not a full page nav)
│   └── [drawer]         role, progress snapshot, notification history, manual actions
├── Communications      — merges former "Notifications" + "Emails" top-level items
│   ├── Templates        — versioned, with rollback (Notification-Architecture.md §12)
│   ├── Queue & Health    — priority matrix, retry/dead-letter state
│   └── Broadcasts        — admin-authored one-off sends
├── Certificates        — issue/revoke, verification lookups, Dev Certificate Tools
├── Feedback            — moderation queue (approve/edit/publish testimonials to marketing site)
└── System               — audit log, env/feature-flag state, cron/queue manual trigger
```

**Rules applied to reach this shape:**
- **Merge, don't multiply.** "Notifications" and "Emails" were two top-level nav items for what is architecturally one system (`Notification-Architecture.md` — event-driven, channel-agnostic). Merged into **Communications**.
- **Dialogs for inspection, pages for management.** User inspection (`/admin/users/[id]`) becomes a **drawer** over the Users table instead of a full page navigation — it's a lookup, not a workspace. Full pages are reserved for things an admin spends sustained time in (Communications, Feedback moderation).
- **Feature Flags move under Content**, not System — flags in this product are almost entirely UX/marketing toggles (site copy, testimonial visibility, notification channel rollout), not infra config; co-locating them with what they control reduces context-switching.
- **Marketing Controls is new** — needed for the Feedback System requirement (testimonial moderation → marketing site) and doesn't fit any existing view.

---

## 3. Notification & Communication Platform — redesign decision

**Current state:** `Notification-Architecture.md` (771 lines) is already a strong, event-driven, channel-agnostic spec — event registry, priority-tiered queue, exponential-backoff retry, timezone-aware scheduler, per-user preferences, versioned templates. This is not being rebuilt; it's being **extended and re-surfaced**.

**What changes:**
1. **Notification UX:** the brief asks to replace the dedicated Notifications page with a right-side panel (Linear/GitHub/Slack pattern). This is a `rendering-pipeline.md`-adjacent change (new `NotificationPanel` component, not a new route) — it reuses the existing `NotificationBell` + `NotificationCenterDrawer` primitives already built in Sprint 6.3, converting the drawer's *content* pattern into a persistent slide-over rather than inventing a new interaction model. Low risk, mechanical change.
2. **Event/Priority/Queue matrix**: already spec'd in `Notification-Architecture.md §7`. Extend it to cover the new events this phase introduces — `feedback.requested` (post 3-lesson/module/certificate trigger, per the Feedback System requirement), `certificate.shared`, `settings.reset_requested` (confirmation emails for destructive Settings actions).
3. **Weekly Recap, auth emails, security emails, milestone emails, admin broadcasts** — all already spec'd (`Notification-Architecture.md §5–§6`); no architectural change, just confirming they're accounted for in `Sprint 7.2`'s scope.

**Recommendation against building anything new here:** the existing spec already solves the hard problems (retry, rate-limiting, preferences, versioning). The only real work left is (a) the panel UX conversion and (b) wiring the new event types this phase adds. Resist the temptation to redesign the queue/retry model — it's not broken and touching it risks the free-tier email budget (`Resend`: 3,000/month, 100/day) that the whole system was carefully designed around.

---

## 4. Settings 2.0 — redesign decision

**Current state:** Settings exists but is scattered (portfolio settings API alone had a real production bug fixed in the Stabilization Sprint). No unified Settings IA exists yet in the docs.

**Final IA (locked for `Sprint 7.2`):**

```
/settings
├── Profile              — name, avatar, bio, portfolio links (linkedin/github/website)
├── Security              — password, session management, connected accounts (Google)
├── Portfolio              — public/private toggle, username/handle, visible sections
├── Notifications          — channel preferences (maps 1:1 to Notification-Architecture.md §11)
└── Danger Zone
    ├── Reset Progress      — per-module or full reset
    ├── Reset XP
    ├── Reset Flashcards
    ├── Reset Streak
    ├── Reset Skill Radar
    └── Delete Account
```

**Key design decision — Danger Zone actions are destructive, irreversible, and must be treated as such architecturally, not just visually:**
- Every reset action requires a typed-confirmation dialog (type the word "RESET" / "DELETE") — this is a UX pattern, but it has a backend implication: **each reset must itself be an `xp_events`-style ledger-respecting operation**, not a raw `DELETE`/`UPDATE`. E.g., "Reset XP" inserts a large negative `xp_events` row with `source_type = 'admin_reset'` rather than truncating the table, preserving the append-only invariant from §1 and giving Support a real audit trail if a user disputes an accidental reset.
- **Delete Account** cascades through every user-owned table (RLS-protected tables listed in `Architecture.md §2`) and must also: revoke the public portfolio URL, invalidate issued certificates' *public verification* (certificate record itself is retained for legal/audit purposes but delinked from a live profile — see `Sprint 7.3`), and fire a `account.deleted` event so any queued notifications for that user are dropped, not just failed silently.

---

## 5. Certificate System 2.0 — redesign decision

**Current state:** certificates exist (`certificates` table, `/verify/[certificateId]` route, PDF export, prominent placement on dashboard/progress/settings/portfolio per the Stabilization Sprint).

**What's genuinely new for `Sprint 7.3`:**
- **Versioning.** Certificates currently have no version field. Adding `template_version int` to the `certificates` table (additive migration, does not touch the frozen core schema's existing columns) so a design refresh doesn't retroactively alter already-issued, publicly-verifiable certificates — a previously issued certificate must always render exactly as it did the day it was issued.
- **LinkedIn compatibility** — structured as an "Add to Profile" deep link using LinkedIn's certification URL parameters (name, issuing organization = "Prodigy", credential ID = `certificate_code`, credential URL = the `/verify/[certificateId]` page). No new infra — this is a URL-construction feature, not a new integration.
- **QR code on the PDF/downloadable certificate** linking to the same `/verify/[certificateId]` page — reuses the existing verification route, no new backend surface.

---

## 6. Mermaid Strategy — redesign decision (simplification)

**Current:** `MermaidBlock.tsx` renders Mermaid diagrams client-side at runtime inside lessons.

**Recommendation (adopted): move to build-time static SVG/PNG generation**, styled from the design-system tokens, generated during `content:compile` (an additional pipeline stage, not a new pipeline) and emitted alongside the existing `content/dist/` output.

**Why this is a genuine simplification, not just a preference:**
- Removes a client-side JS dependency (Mermaid's runtime renderer) from every lesson page that contains a diagram — smaller bundle, faster first paint, one less thing that can fail at runtime in a user's browser.
- Diagrams become trivially themeable from the same design tokens used everywhere else (`theme/tokens.ts`), rather than needing Mermaid's separate theming API kept in sync by hand — directly serves the "one unified design language" requirement.
- Diagrams are already static content authored in Markdown — rendering them at build time instead of request time is consistent with the static-first principle already governing everything else in the content pipeline (`DO_NOT_CHANGE.md §1`).

**Trade-off:** loses Mermaid's rare interactive/pan-zoom capability. Given diagrams here are illustrative (mental models, framework flows), this is an acceptable trade — no lesson currently uses interactive diagram features. Scheduled as a `content-pipeline.md` addendum in `Sprint 7.1`, not a separate sprint — it's a compiler stage addition, small in scope.

---

## 7. Security & Performance — what's genuinely new vs. already documented

Most of the Security and Performance requirements in the brief (RLS, rate limiting, headers, Server/Client Component split, caching, image optimization) are **already correctly specified** in `Architecture.md §9` and `Design.md §4`. The gap is an explicit **threat model** and **performance budget enforcement checklist**, neither of which currently exists as a standalone artifact. Both are scheduled as `Sprint 7.5` deliverables (see `Roadmap.md`) rather than folded into `Architecture.md`, so they can carry their own audit-trail changelog independent of the architecture doc's release cadence.

---

## 8. Summary of Architectural Decisions Made in This Pass

| Decision | Verdict |
|---|---|
| Un-freeze Admin/Notifications/Settings/Certificates/Marketing/Design System | **Adopted** — narrowed §0 freeze |
| Keep content compiler / renderer / ID scheme / XP ledger frozen | **Adopted** — data-integrity risk too high to reopen |
| Merge Admin "Notifications" + "Emails" nav into "Communications" | **Adopted** |
| User inspection as drawer, not full page | **Adopted** |
| Rebuild notification queue/retry/scheduler | **Rejected** — already correct, extend don't rebuild |
| Notification page → right-side panel | **Adopted** — reuses existing components, low risk |
| Certificate versioning via additive column | **Adopted** |
| Mermaid runtime → build-time static SVG | **Adopted** — genuine simplification, consistent with static-first principle |
| New threat model + perf budget checklist as standalone docs | **Adopted**, scheduled Sprint 7.5 |

---

## Changelog

- v1.0 (2026-08-06) — Initial architecture review ahead of Phase 3.7 sprint planning.
