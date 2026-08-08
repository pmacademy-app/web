# PM Academy — Agent Operating Contract

You are OpenCode, the sole coding/implementation agent for this repository (brand **Prodigy**, product **PM Academy**). This file is the operating contract. All decisions live in the canonical docs under `docs/`; this file only says how to work with them. Read it fully once; thereafter read only the relevant sections per task.

## 1. Before starting any task

1. Read `docs/CURRENT_STATUS.md` — current version, phase/sprint focus, active bugs.
2. Read only the documentation sections relevant to the task (see the ownership table below). Do not load the full doc set or read whole docs for a task that touches one area.
3. Inspect the existing implementation you are about to touch first — find the files, read them, and match their patterns.
4. Understand the task before coding. If a requirement is ambiguous, state your assumption or ask — never silently pick an interpretation.

## 2. Source of truth (who owns what)

| Decision area | Owning doc |
|---|---|
| Product behavior, requirements, non-goals | `docs/product/PRD.md` |
| Technical architecture, stack, data model, implementation | `docs/architecture/Architecture.md` |
| Engineering and AI-assisted development rules, standards | `docs/development/Rules.md` |
| Sequencing, current phase, definition of done | `docs/product/Phases.md` — superseded for Phase 3.7+ by `docs/product/Roadmap.md`; live state in `docs/CURRENT_STATUS.md` |
| Visual/UX decisions | `docs/design/Design.md` |
| Brand naming / logo usage | `docs/product/Brand-Architecture.md` |
| Content compiler implementation | `docs/architecture/content-pipeline.md` (wins over `Architecture.md` §4) |
| Lesson renderer implementation | `docs/architecture/rendering-pipeline.md` (wins over `Architecture.md` §5) |
| Database migration workflow | `docs/architecture/Supabase-Migration-Guide.md` |
| Security detail / performance budget | `docs/reports/Security-Threat-Model.md`, `docs/reports/Performance-Budget-Checklist.md` |
| Per-sprint specs | `docs/sprints/` |

`docs/INDEX.md` is the full doc map and conflict-resolution hierarchy — read it when unsure. Never silently override a documented decision in code. If a decision must change, update the owning doc and its Changelog in the same session and keep the docs consistent with each other (`Rules.md` §7).

## 3. Scope of work by size

Pick the smallest scope that satisfies the task. Do not do more than the task requires.

- **Small fix** (bug, copy, one-file change): inspect the code → make the smallest change → targeted verification (the relevant unit test, or lint/type-check; rebuild only if app code changed).
- **Normal task** (a feature or contained change): inspect existing implementation → read the relevant doc sections → state a brief plan before coding → implement following existing project patterns → targeted verification (relevant tests, then `npm run lint` and `npm run build` from `apps/web/` if app code changed).
- **Major feature or architecture change** (new subsystem, data model change, new dependency, frozen-area change): read the relevant `PRD.md` and `Architecture.md` sections fully and validate the approach against them before implementing. After implementing, verify per the owning docs: tests, security/RLS, accessibility (`Design.md` §4), and the performance budget (`Design.md` §4.1) where applicable.

## 4. Verification

Commands run from `apps/web/` (the app workspace):

- Lint: `npm run lint`
- Full build (content compile + Next.js build, includes type check): `npm run build`
- Content-only validation: `npm run content:validate`
- Unit tests for changed logic: `npm run test:<area>` (e.g. `test:srs`, `test:xp`, `test:streaks`, `test:radar`, `test:badges`, `test:leaderboard`, `test:compiler`)

Use targeted verification for small changes; run lint + build before declaring normal or major work complete. Don't run the whole build for a copy-only change.

## 5. Non-negotiable constraints (condensed — full detail lives in the owning docs)

- **Dependencies:** no new service or dependency without a free tier sufficient for launch scale; document any addition in `Architecture.md` §1 the same session. No paid services.
- **Secrets:** never commit secrets. Configure via `apps/web/.env.local` (template: `apps/web/.env.example`). `SUPABASE_SERVICE_ROLE_KEY` is server-only — never import it into client code or expose it to the browser.
- **Database / RLS / security:** schema changes only through versioned migrations in `supabase/migrations/`, applied via the CLI workflow in `Supabase-Migration-Guide.md` — never manual DDL in the Supabase dashboard. Enable RLS on every user-owned table in the same migration that creates it. XP is append-only: write `xp_events`, never `UPDATE users.total_xp` directly. User-state rows reference content by stable `lessonId`, never slug. Every mutation endpoint re-derives authorization from the session; never trust a `user_id` from the request body.
- **Content:** Markdown in `content/` is the single source of truth for lesson content. Edit `.md` files and compile; never hand-edit generated JSON under `content/dist/` and never store lesson content in the database. The content compiler, renderer, stable-ID addressing, and XP ledger are frozen (`Architecture.md` §0) — treat any change there as severity-1.
- **Product invariants:** no AI Mentor feature, no global leaderboard, no purchasable streak mechanics, no paywalled lessons (`PRD.md` §6/§11, `DO_NOT_CHANGE.md`).

## 6. Git hygiene

- `main` is always deployable. Work on a feature branch (`feature/...`, `fix/...`) and merge via PR; keep diffs small and reviewable.
- Short imperative commit messages ("Add SM-2 scheduling to flashcard review"); explain *why* in the body only when non-obvious.
- CI must pass before merge. Never commit secrets or `.env.local`.

## 7. Documentation updates

- If a change alters a documented decision, update the owning doc and append to its Changelog in the same session. Never let two docs contradict; if you find a contradiction, fix the stale doc.
- When you finish work that changes project state, update `docs/CURRENT_STATUS.md` and the memory system (`docs/memory/`, `MEMORY.md`) per `docs/development/IMPLEMENTATION_RULES.md` §3.
- Never update `docs/archive/` (historical record only). Do not write documentation the task didn't ask for.

## 8. Do NOT

- Perform broad audits, repo-wide cleanup, or "improvement" passes the task didn't ask for.
- Refactor code you aren't already touching, or refactor speculatively.
- Read the full documentation set when the task touches one area — read only the relevant sections.
- Reintroduce cut features (AI Mentor, global leaderboard, paywalled content) or reject settled decisions without a reason recorded in the owning doc (`Rules.md` §6).

## 9. Next.js 16 note

Before writing Next.js app code, check `apps/web/AGENTS.md` and read the relevant guide under `node_modules/next/dist/docs/` — this version's APIs and conventions differ from typical training data.
