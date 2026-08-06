# Sprint 8.2 — Marketing Content & SEO

**Phase:** 4 (Public Launch Preparation) · **Depends on:** Sprint 8.1 (pages must exist before they can be optimized/indexed). · **Blocks:** Sprint 8.6 (Public Launch QA verifies SEO/search as part of final regression).
**Companion docs:** `../architecture/content-pipeline.md §8` (search index generation — already runs on every compile, unaffected by this sprint), `../architecture/rendering-pipeline.md §8` (`SearchOverlay` spec this sprint turns on), `../design/Design.md §6` (SEO strategy), `../product/PRD.md §5` (SEO as a non-functional requirement).

---

## Goal

Make public lesson and marketing pages genuinely indexable, and turn on the client-side search UI that's been pipeline-ready since the original content compiler shipped. This sprint is the direct successor to what the predecessor `Phases.md` scoped as "Phase 4" — carried forward with the same rationale, renumbered into this roadmap.

## Deliverables

1. Structured data (Article/Course schema) on public lesson preview pages.
2. `sitemap.xml` generation (build-time, consistent with the static-first principle — not a runtime-generated sitemap).
3. Open Graph tags site-wide (marketing pages + public lesson previews), using the `og-image.png` asset from Sprint 7.1.
4. `SearchOverlay` component turned on: `Cmd/Ctrl+K` trigger, lazy-loads `content/dist/search-index.json` on first open (not page load), block-aware deep-linking to `(lessonId, blockId)` — the component itself was already spec'd in `rendering-pipeline.md §8`; this sprint is the enablement, not a new build.
5. `robots.txt` correctly configured to allow indexing of public/marketing routes and disallow authenticated app routes.

## UI Changes

- `SearchOverlay` becomes reachable via `Cmd/Ctrl+K` from the curriculum shell (`app/academy/layout.tsx`) — this is the only new interactive UI in this sprint; everything else is head/meta-level.

## Backend Changes

- None to application logic. The FlexSearch index (`search-index.json`) is already generated on every `content:compile` run per `content-pipeline.md §8` — this sprint consumes it, doesn't change how it's produced.

## Database Changes

None.

## API Impact

None — search runs entirely client-side against the static index; no new API surface.

## Testing Checklist

- [ ] Public lesson preview pages pass Google's Rich Results structured-data validator.
- [ ] `sitemap.xml` includes all public marketing pages and public lesson preview pages; excludes authenticated app routes.
- [ ] Open Graph tags render correctly when a marketing or lesson-preview URL is shared (verify via a real social-preview debugger, not just source inspection).
- [ ] `Cmd/Ctrl+K` opens the search overlay from any authenticated app screen; first-open latency is acceptable (index load is lazy, not blocking initial page load).
- [ ] Search returns relevant, block-aware results across all 90 lessons in under 100ms perceived latency (the existing target from `Architecture.md §5`) — verified with real queries, not assumed from the index existing.
- [ ] `robots.txt` correctly blocks indexing of `/dashboard`, `/settings`, `/admin`, etc.

## Definition of Done

- Public lesson pages are indexable and pass structured-data validation.
- Search is live, meets the latency target, and deep-links correctly to the matching block, not just the lesson root.
- Matches every Definition-of-Done criterion originally specified for this work in the predecessor `Phases.md`'s Phase 4 — no scope was lost in the roadmap renumbering.

## Out of Scope

- Server-side search — explicitly a non-goal per `PRD.md §6`; unchanged by this sprint.
- New public lesson previews beyond the existing 3–5 sample lessons (`PRD.md §8`) — this sprint optimizes discoverability of what exists, doesn't expand the sample set.

## Risks

- **Search index size at first-open latency.** Already has a documented scalability trigger (`Architecture.md §5`: revisit past ~2,000 lessons or if the index measurably affects first-open latency) — at 90 lessons this is not expected to be a problem, but verify with a real measurement, not just the documented assumption.
- **Structured data schema drift** if Google's requirements change between when `Design.md §6` was written and this sprint executes — mitigate by validating against the live Rich Results tool at implementation time, not against documentation alone.

## Future Extensions

- Expanding the public sample-lesson set if SEO performance data (post-launch) shows specific high-traffic query gaps.
- Algolia/Typesense adapter, only if the documented scalability trigger is actually reached (`Architecture.md §5`).
