# Prodigy PM Academy — Known Issues & Deferred Backlog

This document lists remaining non-critical technical debt and any genuinely deferred features. Swept this phase (Sprint 7.1) per `Documentation-Synchronization-Report.md §2.2` — items resolved by Phase 3 (RC1) are moved to §1 below with the resolving milestone noted; only genuinely open items remain in §2.

---

## 1. Resolved (moved here, Sprint 7.1 sweep — kept for history, not action items)

### ✅ Google OAuth Integration — *Resolved, Phase 3*
Configured and live; "Continue with Google" is fully functional alongside Email+Password.

### ✅ Module Capstones — *Resolved, Phase 3*
Submission dashboard, uploader, and review flow shipped; `capstone_submissions` is in active use.

### ✅ Badge Showcases & Leaderboards — *Resolved, Phase 3*
Badge rules evaluation, cohort leaderboard, and certificate generation are live (certificate system further extended in Sprint 7.3 — see `Roadmap.md`).

### ✅ Onboarding Placement Assessment — *Resolved, Phase 2*
Baseline competency quiz is part of onboarding.

---

## 2. Open — Non-Critical Technical Debt

### 📐 Supabase DB Query Type Casts (`as unknown as DBChain`)
*   **Description:** Widespread usage of `as unknown as DBChain` and custom return type casting in service layers (`lessons-db.ts`, `flashcards-service.ts`, `lessons-completion-service.ts`, `xp-service.ts`), and now also present in the new `settings-service.ts` / `admin/feedback-service.ts` (Sprint 7.2/7.4).
*   **Impact:** TypeScript does not statically verify query filters or database row select statements.
*   **Resolution:** Generate database schemas and TypeScript interfaces using the Supabase CLI (`supabase gen types typescript`) and configure the client to use them. Still open — flagged as a candidate to close before or during Sprint 7.5 (Security & Performance) since type-safety gaps are exactly the kind of thing a pre-launch hardening pass should close, though it wasn't made an explicit Sprint 7.5 deliverable in this roadmap — worth a founder call on whether to fold it in.

### ⚡ Dashboard "Up Next" Lesson Ordering
*   **Description:** The "Up Next" CTA shows the first incomplete lesson in sequential order rather than the first incomplete *and unlocked* lesson.
*   **Impact:** A user completing lessons out of order (admin override, historical state) might see a locked lesson linked.
*   **Resolution:** Update the query to find the first lesson with all prerequisites met and incomplete. Still open — natural fit for `Sprint 7.6` (Dashboard & Learning Experience) since that sprint already touches this exact CTA; flagged there as a bundled fix, not a separate sprint.

### 🕒 Timezone-Aware Onboarding Goal Defaults
*   **Description:** Timezone detection in `auth.ts` during server-side registration defaults to `UTC` rather than the browser's local timezone.
*   **Impact:** New users default-initialize to UTC.
*   **Resolution:** Collect client-side timezone via `Intl.DateTimeFormat().resolvedOptions().timeZone` during onboarding. Still open — low severity, not blocking launch, but worth closing opportunistically during Sprint 7.5's hardening pass.

### ♿ Accessibility (a11y) Pass — Partially Superseded
*   **Description:** Some interactive elements were missing `aria-label`/role declarations as of Phase 1.
*   **Status update:** `Sprint 7.5` (Security & Performance) and `Sprint 8.5` (Mobile Experience) both include a real axe-core + manual screen-reader audit as explicit deliverables — this item is no longer a vague backlog entry but has a concrete, dated verification plan in `Performance-Budget-Checklist.md`. Leaving this entry open until that checklist shows a passing result, at which point it moves to §1.

---

## Changelog

- v2.0 (2026-08-06, Sprint 7.1) — Swept resolved-by-RC1 items into §1; updated open items with current sprint linkage per `Roadmap.md`; superseded the vague a11y entry with a reference to `Performance-Budget-Checklist.md`'s concrete verification plan.
