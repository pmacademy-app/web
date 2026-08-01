# PM Academy — Agent Rules (AGENTS.md)

**This file applies to ALL AI agents working in this workspace.**
Read this before any other file. Then read `docs/INDEX.md` — it is the documentation entry point that maps every document, defines the reading order, and resolves conflicts between docs. Review `docs/CURRENT_STATUS.md`, `docs/IMPLEMENTATION_RULES.md`, and `docs/DO_NOT_CHANGE.md` before writing code to align on current status, coding rules, and invariants. Then load `docs/Architecture.md`, `docs/PRD.md`, `docs/Rules.md`, `docs/Phases.md`, and `docs/Design.md`.

---

## Quick-Reference: Non-Negotiable Rules

1. **Markdown is the source of truth.** Never store lesson content in Supabase. Never hand-edit generated JSON in `public/content/`.
2. **Supabase = user state only.** See `apps/web/lib/supabase.ts` for the complete schema.
3. **Static-first.** All lesson content served as pre-generated JSON. No runtime Markdown parsing.
4. **XP is append-only.** Write `xp_events` row first, then recompute the cache. Never directly increment `users.total_xp`.
5. **Auth guard every API route.** Use `supabase.auth.getUser()`, not `body.user_id`.
6. **RLS on every user-owned table.** Policy: `user_id = auth.uid()`.
7. **No dark patterns, ever.** No purchasable streaks, no paywalled lessons, no urgency manufacturing.
8. **Deploy through the pipeline.** GitHub → GitHub Actions → Vercel only.
9. **`SUPABASE_SERVICE_ROLE_KEY` is server-only.** Never expose to the browser.
10. **No AI Mentor feature.** It's an unresolved open decision in PRD.md §11. Do not build it.

---

## Tech Stack (locked)

**Next.js 16 App Router + TypeScript 5 (strict) + Tailwind CSS v4 + shadcn/ui + Framer Motion**
**Supabase (PostgreSQL + Auth) + Vercel + Resend SMTP + Google Analytics**

See `docs/Architecture.md §1` for the full locked-in stack table.

---

## Next.js Version Warning

This project uses **Next.js 16** with the App Router. This version has differences from Next.js 13/14/15. Before writing any Next.js-specific code, check `apps/web/node_modules/next/dist/docs/` for version-specific APIs. Do not assume Next.js conventions from training data match this version.

---

## Skill System

Project-specific skills are in `.agents/skills/`. Load them as needed:

| Skill | When to load |
|-------|-------------|
| `00-pm-academy-core` | ALWAYS — every session |
| `01-frontend-engineer` | Building UI, components, pages |
| `02-backend-engineer` | Supabase, API routes, migrations |
| `03-content-pipeline` | Content pipeline, lesson schema, scripts/ |
| `04-design-system` | UI design, components, visual direction |
| `05-seo-performance` | SEO, Lighthouse, structured data |
| `06-testing-qa` | Tests, QA flows, Definition of Done |
| `07-git-deployment` | Git workflow, CI, Vercel, releases |
| `08-sprint-planning` | Feature scoping, phase planning, product decisions |
| `09-security` | RLS, auth, secrets, privacy |
| `10-feature-workflow` | Implementing a feature end-to-end |
| `11-bug-fixing` | Debugging, investigation, hotfixes |
| `12-refactoring-code-review` | Code review, refactoring, quality |
