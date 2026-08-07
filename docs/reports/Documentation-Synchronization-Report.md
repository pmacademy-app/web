# Prodigy PM Academy — Documentation Synchronization Report

**Date:** 2026-08-06
**Scope:** Full read of `docs/` (18 live files + `memory/` + `archive/`) prior to the Phase 3/4 rewrite.
**Purpose:** Record every contradiction, staleness gap, and structural risk found in the existing documentation *before* changing it, so the rewrite is a deliberate correction, not a silent one (per `Rules.md §7.5`: "never let two documents contradict each other").

---

## 1. Critical — Must Fix Before Any Further Work

### 1.1 `docs/memory/roadmap.md` is badly stale
- **Contradiction:** `memory/roadmap.md` shows Phase 3 as `Not Started / Scaffolded ❌`, listing capstones, badges, leaderboard, portfolio export, and certificates as unbuilt.
- **Reality per `CURRENT_STATUS.md`:** Phase 3 Sprints 1–6.5 are all `✅ Complete`, including capstones, portfolio, certificates, badges, leaderboard, notification platform (in-app + email), and a working Admin Console with RBAC. The repo is tagged `v1.0.0-rc1`.
- **Why this matters:** `memory/roadmap.md` exists specifically so an AI agent or new contributor doesn't have to re-derive project state from scratch. Right now it actively misleads — an agent reading only that file would try to rebuild features that already exist.
- **Fix applied:** `memory/roadmap.md` is rewritten in this pass to match `CURRENT_STATUS.md` as of RC1, and the new `Roadmap.md` (replacing `Phases.md` as the forward-looking plan) is the single place Phase 3.7 onward is tracked.

### 1.2 `Architecture.md`'s "frozen" declaration blocks the work this brief asks for
- **Statement in doc:** *"As of the `v1.0.0-foundation` release, the core learning infrastructure ... is frozen. Future work must not modify these subsystems unless required for critical security ... or high-severity functional bugs."*
- **Conflict:** This brief explicitly asks for redesign of Admin Console, Notifications, Settings, Certificates — none of which are "core learning infrastructure" (content pipeline, renderer, routing, DB schema), but the freeze notice is worded broadly enough to be read as blocking all of it.
- **Resolution (not a silent override):** The freeze is **narrowed and re-stated explicitly** in the rewritten `Architecture.md` to cover exactly four subsystems: the content compiler, the block renderer, the `lessonId`/`blockId` addressing scheme, and the append-only XP ledger. Everything else in the product — Admin IA, notification delivery UX, Settings, Certificates, Marketing site, Design System — is explicitly **not** covered by the freeze and is in scope for Phase 3.7+. This distinction is now a named section (`Architecture.md §0`) so it can never be misread again.

### 1.3 Brand name is not yet reflected anywhere
- Every existing document says "PM Academy." The brief establishes the final brand as **Prodigy** (company) / **PM Academy** (product) / **Prodigy PM Academy** (full name).
- No document currently distinguishes brand from product, so there's no config for "Prodigy" as a parent brand (e.g., for a future second product).
- **Fix applied:** New `Brand-Architecture.md` is the owning document for naming, brand/product separation, and logo strategy. Every other doc's title bar is updated to `Prodigy PM Academy` in this pass; in-body prose still says "PM Academy" or "the Academy" for readability (see `Brand-Architecture.md §4` for the naming-conventions rule this follows).

---

## 2. Moderate — Inconsistencies That Will Cause Confusion, Not Breakage

### 2.1 Two competing "when do things ship" documents
`Phases.md` (weeks-1-through-23, phase-based) and `memory/roadmap.md` (checklist-based) both claim to track sequencing, and now both are stale relative to `CURRENT_STATUS.md`. Recommendation (applied): `Phases.md` is retired to `archive/` once `Roadmap.md` ships, exactly like the three Sprint docs were retired when `Design.md` consolidated them. Same retirement pattern, same rationale: one authoritative sequencing doc, not two half-synced ones.

### 2.2 `KNOWN_ISSUES.md` describes a pre-RC1 state
Items like "Google OAuth deferred to Phase 3" and "Module Capstones deferred to Phase 3" are resolved — Phase 3 is done. `KNOWN_ISSUES.md` needs a pass to move resolved items to a "Resolved" section (with the resolving sprint noted) and keep only genuinely open tech debt (e.g., the `as unknown as DBChain` type-cast debt, which is still real). Scheduled as part of Sprint 7.1 (Global Branding & Documentation) deliverables.

### 2.3 `content-pipeline.md`/`rendering-pipeline.md` reference "Phase 4" for search UI enablement
Consistent with `Phases.md`'s old numbering. Once `Roadmap.md` renumbers phases (Phase 3 → "Product Completion," Phase 4 → "Public Launch Preparation"), every cross-reference to "Phase 4" for search needs updating to point at the correct sprint (`Sprint 8.1` or wherever search UI lands). Flagged for the pipeline-doc sync pass in Sprint 7.1.

### 2.4 `Design.md` predates the Admin Console, Notification Panel, and Certificate redesigns
`Design.md §10` documents the *existing* Admin Console visual system (Sprint 6.4.2) — it's accurate for what's live today but doesn't yet reflect the unified design-system pass this brief calls for (one visual language across Learner/Admin/Marketing/Certificates/Emails/Notification Panel/Settings). `Design.md` needs a full rewrite, not a patch — scheduled as part of Sprint 7.6 / the Design System workstream below.

---

## 3. Minor — Housekeeping

- `INDEX.md`'s reading order (steps 1–15) is still accurate in structure but needs new entries once `Brand-Architecture.md` and `Roadmap.md` exist and `Phases.md` archives.
- `AUTH_FLOW.md` is genuinely current (last updated 2026-08-03, matches the live callback implementation) — no changes needed beyond a title-bar rebrand.
- `Supabase-Migration-Guide.md` and `GitHub-Repos-and-Starter-Kits.md` are reference/how-to docs, not architecture — left as-is except for rebrand.
- The `archive/` folder is correctly marked non-authoritative and was not mined for anything not already captured in the live docs.

---

## 4. What This Pass Changes vs. Leaves Alone

| Category | Action this pass |
|---|---|
| Brand naming | New `Brand-Architecture.md`; title-bar rebrand across all docs |
| Roadmap / sequencing | `Phases.md` → archived; new `Roadmap.md` is authoritative from Phase 3.7 forward |
| `memory/roadmap.md` | Corrected to match RC1 reality |
| `Architecture.md` | Freeze clause narrowed and made explicit (§0); Admin/Notification/Settings/Certificate sections rewritten |
| Admin Console, Notifications, Settings, Certificates, Marketing, Design System | Redesigned per this brief — see `Architecture-Review-Report.md` and the individual sprint docs |
| Content pipeline, renderer, DB schema for existing tables, `lessonId` addressing | **Not touched.** These remain frozen per the narrowed §0 scope — see rationale in `Architecture-Review-Report.md §1` |
| `KNOWN_ISSUES.md` | Resolved-items sweep scheduled in Sprint 7.1 |
| `INDEX.md` | Updated reading order once new docs land |

---

## Changelog

- v1.0 (2026-08-06) — Initial synchronization report, produced before any document rewrite, per this brief's "read every document before making changes" instruction.
