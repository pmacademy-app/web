# PM Academy — Documentation Integrity Report

**Date:** 2026-08-06
**Scope:** Full cross-reference audit of `docs/` after the subfolder reorganization (`product/`, `architecture/`, `development/`, `design/`, `roadmap/`, `reports/`, `memory/`, `archive/`). Fix broken clickable links, wrong filenames, and stale path references; improve navigation; verify integrity; record what was intentionally left alone.

**Constraint honored:** no document was rewritten, no product decision, architecture, roadmap, or sprint plan was changed. All edits are link/path/navigation fixes plus one factual workflow-filename correction.

---

## 1. Verification Method

A Node script (`doclinkcheck.js`) scans every `.md` file under `docs/` and reports two categories:

1. **Broken markdown links** — `[text](target)` where `target` does not resolve to a file.
2. **Backtick references** — `` `filename.md` `` or `` `path/...` `` refs that do not resolve relative to their containing document.

**Result after this pass: 0 broken clickable markdown links.** The `=== BROKEN MARKDOWN LINKS ===` section is empty.

579 backtick references remain that do not resolve from their containing folder; these follow the project's bare-filename convention (section 3 below).

---

## 2. Fixed in This Pass

### 2.1 Clickable link paths corrected (previously 42 broken)

| File | Fix |
|------|-----|
| `INDEX.md` | Every link rewritten to the subfolder layout (`./product/PRD.md`, `./architecture/Architecture.md`, `./development/IMPLEMENTATION_RULES.md`, `./development/KNOWN_ISSUES.md`, `./development/DO_NOT_CHANGE.md`, `./development/Rules.md`, `./product/Phases.md`, `./design/Design.md`, `./architecture/content-pipeline.md`, `./architecture/rendering-pipeline.md`, `./architecture/AUTH_FLOW.md`, `./architecture/Notification-Architecture.md`, `./architecture/Supabase-Migration-Guide.md`, `./development/GitHub-Repos-and-Starter-Kits.md`) |
| `CURRENT_STATUS.md` | `./Phases.md` → `./product/Phases.md` |
| `development/IMPLEMENTATION_RULES.md` | All 10 links corrected (`../INDEX.md`, `../CURRENT_STATUS.md`, `../architecture/content-pipeline.md`, `../architecture/rendering-pipeline.md`, `../product/Phases.md`, `../../apps/web/lib/`, `../memory/`, `../../MEMORY.md`, `../architecture/Supabase-Migration-Guide.md`) |
| `development/DO_NOT_CHANGE.md` | `./INDEX.md` → `../INDEX.md` |
| `memory/roadmap.md` | `../Phases.md` → `../product/Phases.md` |
| `architecture/Supabase-Migration-Guide.md` | §5 link pointed at non-existent `.github/workflows/supabase-deploy.yml` → now points to the real `deploy-supabase` job in `.github/workflows/ci.yml` |

### 2.2 Wrong filenames corrected

| File | Fix |
|------|-----|
| `design/Design.md` | `archive/Design-Session-Sprint-1.md` → `../archive/Design-System-Sprint-1.md` (wrong name); other two archive refs path-qualified |
| `architecture/content-pipeline.md` | `rendering-pipeline-spec-v2.md` (mermaid diagram + §0 migration note) → `rendering-pipeline.md` |
| `architecture/Architecture.md` §8 | `app-deploy.yml` / `supabase-deploy.yml` (files that never existed) → `ci.yml` jobs `build-and-validate` and `deploy-supabase`; prose updated from "two separate workflows" to "two pipelines in one workflow" to match the real CI |

### 2.3 `docs/sprints/` → `docs/roadmap/`

`docs/sprints/` never existed; the sprint specs live in `docs/roadmap/`. Corrected in `product/Roadmap.md` (companion header, "How to read" section, Sprint 7.1 full-spec line) and `roadmap/Sprint-7.1-Global-Branding-Documentation.md` (deliverable #8).

### 2.4 Companion-docs header blocks path-qualified

"Companion docs:" / "Documentation entry point:" / "Archived reference:" header lines now carry resolvable relative paths in: `Architecture.md`, `Rules.md`, `Design.md`, `PRD.md`, `Phases.md`, `Roadmap.md`, `Brand-Architecture.md`, `Supabase-Migration-Guide.md`, `Notification-Architecture.md`, `content-pipeline.md`, `rendering-pipeline.md`, and all 12 sprint specs under `roadmap/`.

### 2.5 Navigation completeness (`INDEX.md`)

- `Roadmap.md` added to the reading order (step 10) and Document Map (Core Specification Documents) — it supersedes `Phases.md` for everything after Phase 3, per its own stated status.
- `Brand-Architecture.md` added to the reading order (step 11) and Document Map.
- Core Specification Documents intro updated from "five" to "seven" documents.
- INDEX changelog bumped to v1.2; Architecture changelog bumped to v2.6.

### 2.6 `.agents/` agent-guidance paths

`docs/…` references updated to the subfolder layout in `.agents/AGENTS.md`, `.agents/README.md`, `.agents/skills/00-pm-academy-core/SKILL.md`, and `.agents/skills/08-sprint-planning/SKILL.md`.

---

## 3. Remaining Backtick References (documented, intentionally not fixed)

579 backtick references do not resolve from their containing folder. Per the agreed scope, inline body references keep the project's bare-filename convention (e.g. `` `PRD.md §6` ``) and are recorded here rather than rewritten.

**By kind:** exists-elsewhere (file exists elsewhere in `docs/`) 537 · missing-file 21 · path-style 17.

| File | Count |
|------|-------|
| `INDEX.md` | 60 |
| `development/Rules.md` | 50 |
| `design/Design.md` | 44 |
| `reports/Documentation-Synchronization-Report.md` | 43 |
| `product/Phases.md` | 39 |
| `product/PRD.md` | 30 |
| `roadmap/Sprint-7.1-Global-Branding-Documentation.md` | 25 |
| `archive/Marketing-Website-Sprint-2.md` | 22 |
| `product/Roadmap.md` | 21 |
| `reports/Architecture-Review-Report.md` | 19 |
| `development/IMPLEMENTATION_RULES.md` | 17 |
| `archive/Design-System-Sprint-1.md` | 15 |
| `roadmap/Sprint-7.5-Security-Performance.md` | 13 |
| `memory/roadmap.md` | 13 |
| `memory/decisions.md` | 12 |
| `archive/Content-Communication-System-Sprint-3.md` | 12 |
| `roadmap/Sprint-7.2-Settings-2.0.md` | 11 |
| `roadmap/Sprint-8.3-Legal-Support.md` | 11 |
| `architecture/Architecture.md` | 11 |
| `roadmap/Sprint-8.2-Marketing-Content-SEO.md` | 10 |
| `roadmap/Sprint-7.4-Admin-Console-Polish.md` | 10 |
| `roadmap/Sprint-8.1-Marketing-Website-v2.md` | 10 |
| `CHANGELOG.md` | 9 |
| `reports/Product-Review-Report.md` | 9 |
| `roadmap/Sprint-7.3-Certificate-System-2.0.md` | 7 |
| `memory/architecture.md` | 7 |
| `architecture/content-pipeline.md` | 6 |
| `roadmap/Sprint-7.6-Dashboard-Learning-Experience.md` | 6 |
| `archive/02-PM-Academy-0-to-1-Roadmap.md` | 5 |
| `development/GitHub-Repos-and-Starter-Kits.md` | 5 |
| `roadmap/Sprint-8.6-Public-Launch-QA.md` | 4 |
| `memory/mistakes.md` | 4 |
| `roadmap/Sprint-8.4-Notification-UX.md` | 3 |
| `memory/implementation.md` | 3 |
| `architecture/rendering-pipeline.md` | 2 |
| `roadmap/Sprint-8.5-Mobile-Experience.md` | 2 |
| `product/Brand-Architecture.md` | 2 |
| `CURRENT_STATUS.md` | 1 |
| `development/DO_NOT_CHANGE.md` | 1 |
| `architecture/Supabase-Migration-Guide.md` | 1 |

**Deliberately excluded from the count of actionable issues:**

- **`archive/` (4 docs, ~54 refs):** frozen historical reference; per project rule "never update the archive files."
- **`reports/` (3 docs):** dated analysis documents; their body references record what was read at the time.
- **`docs/memory/roadmap.md` and `roadmap/Sprint-7.1-Global-Branding-Documentation.md` (x2):** repo-root-relative refs like `memory/roadmap.md` — resolvable as `docs/memory/roadmap.md`, flagged as "path" by the script only because it strips the `docs/` prefix.

---

## 4. Intentional Non-Fixes (flagged for future sprints)

| Item | Reason left alone | Owner |
|------|-------------------|-------|
| `memory/roadmap.md` Phase 3 status still shows "Active Development Stage" though RC1 is complete | Already scheduled as **Sprint 7.1 deliverable #7** ("memory/roadmap.md correction to match CURRENT_STATUS.md") | Sprint 7.1 |
| `Phases.md` not archived | Kept live per this pass's decision; `Roadmap.md` and `Sprint 7.1` anticipate its archival. Recommend archiving it (per `Documentation-Synchronization-Report.md §2.1`) in Sprint 7.1 when the roadmap is fully in force | Sprint 7.1 |
| `Security-Threat-Model.md` and `Performance-Budget-Checklist.md` referenced by `Roadmap.md` and `Sprint 7.5` but not yet created | They are **deliverables** of Sprint 7.5, not missing files | Sprint 7.5 |
| `content-pipeline.md` / `rendering-pipeline.md` "Supersedes: `md-to-json-pipeline-audit.md` / `lesson-rendering-pipeline-audit.md`" | v1 audit docs are not in the tree; the lines are historical provenance notes with no resolvable target | — |
| `CHANGELOG.md` references to pre-reorg root paths and removed `apps/web/CLAUDE.md` | Historical record of what was done; not current references | — |
| `development/Rules.md` §3.4 "§Architecture.md §5" typo | Inline body reference; flagged here for a future copy fix | — |
| `design/Design.md` §7 inline `archive/Content-Communication-System-Sprint-3.md` | Body reference; path-qualified header block already fixed (§2.2) | — |
| `Documentation-Synchronization-Report.md` / `Sprint 7.1` inline `memory/roadmap.md` refs | Repo-root-relative, resolvable in practice | — |

---

## 5. Verification Command

Re-run the audit after any future docs change:

```
node C:\Users\ASUS\AppData\Local\Temp\opencode\doclinkcheck.js
```

Expect: `=== BROKEN MARKDOWN LINKS ===` followed immediately by the backtick section (zero broken links).

---

## Changelog

- v1.0 (2026-08-06) — Initial integrity report after the documentation structure pass: fixed all 42 broken clickable links, wrong filenames (incl. §8 workflow names), `docs/sprints/` → `docs/roadmap/`, companion-docs headers, and `.agents/` paths; added `Roadmap.md` + `Brand-Architecture.md` to INDEX; verified 0 broken links remain; recorded the 579 deferred backtick references and intentional non-fixes.
