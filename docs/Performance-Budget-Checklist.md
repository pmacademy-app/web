# Prodigy PM Academy — Performance Budget Checklist

**Status:** New document (Sprint 7.5 deliverable), operationalizing `Design.md §4`'s Lighthouse ≥ 90 / WCAG AA targets into a per-page-type, pass/fail, dated record. Re-run at mobile viewport widths (Sprint 8.5) and again at final launch QA (Sprint 8.6) — this document is updated in place each time, not replaced, so the history of results is visible.

---

## 1. Budget Targets (unchanged from `Design.md §4` / `PRD.md §5`)

- Lighthouse Performance ≥ 90
- WCAG AA (automated via axe-core + at least one manual screen-reader pass on the highest-stakes new surface, the Settings Danger Zone)
- Bundle size: no route ships client-side Mermaid runtime JS (post Sprint 7.1's static-SVG migration) or any other avoidable client dependency for content that's static at build time

## 2. Pages Audited This Phase (Sprint 7.5 baseline)

| Page | Lighthouse (desktop) | Lighthouse (mobile — Sprint 8.5) | axe-core | Manual a11y pass | Result | Re-verified Sprint 8.6 |
|---|---|---|---|---|---|---|
| Lesson page (with Mermaid diagram) | _record score_ | _record score_ | _pass/fail_ | — | _pass/fail_ | _pass/fail_ |
| Dashboard (post-7.6 split) | _record score_ | _record score_ | _pass/fail_ | — | _pass/fail_ | _pass/fail_ |
| Progress (post-7.6 split) | _record score_ | _record score_ | _pass/fail_ | — | _pass/fail_ | _pass/fail_ |
| Settings — Danger Zone | _record score_ | _record score_ | _pass/fail_ | **required** — screen-reader pass on typed-confirmation flow | _pass/fail_ | _pass/fail_ |
| Certificate detail view | _record score_ | _record score_ | _pass/fail_ | — | _pass/fail_ | _pass/fail_ |
| Admin Overview | _record score_ | _record score_ (lower priority, must be usable not optimized per Sprint 8.5) | _pass/fail_ | — | _pass/fail_ | _pass/fail_ |
| Marketing homepage (v2) | _record score_ | _record score_ | _pass/fail_ | — | _pass/fail_ | _pass/fail_ |
| Notification Panel (open state) | _record score_ | _record score_ | _pass/fail_ | **required** — focus trap / Escape-to-close check | _pass/fail_ | _pass/fail_ |

*Cells are intentionally left as fill-in-the-blank templates — this document's job is to hold real, dated measurements once each sprint executes and the audit is actually run, not to assert scores that haven't been measured. A Definition of Done in `Sprint 7.5`/`Sprint 8.5`/`Sprint 8.6` is not met until every cell above has a recorded, dated result.*

## 3. Bundle / Loading Verification

| Check | Method | Result |
|---|---|---|
| Zero Mermaid runtime JS shipped to any lesson route | Production bundle analysis, spot-check ≥3 diagram-containing lessons | _pass/fail_ |
| Search index (`search-index.json`) lazy-loads only on first `Cmd/Ctrl+K` open, not on initial page load | Network waterfall inspection | _pass/fail_ |
| `SUPABASE_SERVICE_ROLE_KEY` absent from any client bundle | Production bundle grep (shared check with `Security-Threat-Model.md §3`) | _pass/fail_ |

## 4. Caching & Rendering Strategy Verification

- Server Components used by default; Client Components only where interactivity requires it (`Design.md §4`) — spot-checked on the newest surfaces (Settings, Notification Panel, Admin) since these are the ones most likely to over-reach for `"use client"` during fast-moving sprint work.
- Static content (lesson JSON, Mermaid SVGs, marketing pages) served via Vercel Edge Network caching — confirmed via response headers on a production request, not assumed from `next.config.js` alone.

## 5. Mobile-Specific Results (Sprint 8.5)

Mobile Lighthouse scores are recorded in the same table (§2) as a separate column, not a separate document — mobile commonly underperforms desktop and must independently clear the ≥90 bar, not inherit a passing desktop score. The Notification Panel's mobile-specific interaction pattern (full-screen takeover, per `Design.md §8`) is verified here for both performance and the focus-trap/Escape-to-close accessibility check.

## 6. Final Launch Re-Verification (Sprint 8.6)

Every result in §2 is re-run against the fully integrated, production system immediately before launch — a score that passed in isolation during its own sprint can regress once combined with everything else built afterward. This is not a formality; `Sprint 8.6`'s Definition of Done explicitly requires this re-verification, not a reference back to the original Sprint 7.5 numbers.

---

## Changelog

- v1.0 (2026-08-06) — Initial checklist structure and audited page-type list, Sprint 7.5 deliverable. Cells populate with real results as each sprint's audit executes; this document updates in place through Sprint 8.5 and Sprint 8.6 rather than being replaced.
