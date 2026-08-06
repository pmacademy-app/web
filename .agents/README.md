# PM Academy — Antigravity Skill System

**Version:** 1.0  
**Last Updated:** 2026-07-28  
**Author:** AI operating system for PM Academy, a solo-founder project  

---

## What This Is

A complete, project-specific Antigravity skill library for PM Academy. Every skill here was authored by analyzing the actual codebase and all five source-of-truth documentation files (`PRD.md`, `Architecture.md`, `Rules.md`, `Phases.md`, `Design.md`). These are not generic skills — they encode PM Academy's specific architecture, rules, decisions, and constraints.

---

## Skill Library

| # | Skill Folder | Name | When to Load |
|---|-------------|------|-------------|
| 00 | `00-pm-academy-core` | **Core Project Context** | **ALWAYS** — every session |
| 01 | `01-frontend-engineer` | Frontend Engineer | Building UI, pages, components, animations |
| 02 | `02-backend-engineer` | Backend Engineer | Supabase, API routes, migrations, auth |
| 03 | `03-content-pipeline` | Content Pipeline | Lesson schema, scripts, Markdown authoring |
| 04 | `04-design-system` | Design System | Visual design, components, UX patterns |
| 05 | `05-seo-performance` | SEO & Performance | SEO, Lighthouse, structured data |
| 06 | `06-testing-qa` | Testing & QA | Unit tests, QA flows, Definition of Done |
| 07 | `07-git-deployment` | Git & Deployment | Git workflow, CI, Vercel, releases |
| 08 | `08-sprint-planning` | Sprint Planning | Feature scoping, phases, product decisions |
| 09 | `09-security` | Security | RLS, auth security, secrets, privacy |
| 10 | `10-feature-workflow` | Feature Workflow | Implementing features end-to-end |
| 11 | `11-bug-fixing` | Bug Fixing | Debugging, investigation, hotfixes |
| 12 | `12-refactoring-code-review` | Refactoring & Code Review | Code quality, review checklists |
| 13 | `13-prompt-templates` | Prompt Templates | Ready-to-use task prompts |
| 14 | `14-product-architect` | Product Architect | Architectural decisions, system design |

---

## Skill Combinations for Common Tasks

| Task | Load these skills |
|------|------------------|
| Build a new lesson UI component | 00-core + 01-frontend + 04-design |
| Add a new API route with DB mutation | 00-core + 02-backend + 09-security |
| Work on the content pipeline | 00-core + 03-content-pipeline |
| Implement a full feature (e.g., flashcard SRS) | 00-core + 10-feature-workflow + 01-frontend + 02-backend |
| Debug a bug in streaks or XP | 00-core + 11-bug-fixing + 02-backend |
| SEO optimization pass | 00-core + 05-seo + 01-frontend |
| Sprint planning / phase decisions | 00-core + 08-sprint-planning |
| Code review / refactoring | 00-core + 12-refactoring |
| New architectural decision | 00-core + 14-product-architect |
| Security audit | 00-core + 09-security + 02-backend |

---

## Architecture in One Page

```
PM Academy
├── Content: /content/lessons/lesson-NNN.md (90 files — SOURCE OF TRUTH)
│   └── Pipeline: parse → validate → JSON → search-index → public/content/
├── Frontend: apps/web/ (Next.js 16 App Router + TypeScript + Tailwind v4 + shadcn)
│   ├── (marketing)/ — public SSR pages for SEO
│   ├── (auth)/       — signup/login/reset
│   ├── (portfolio)/  — public /p/[username] (no auth wall)
│   └── (app)/        — authenticated product (dashboard, curriculum, review, progress)
├── Backend: Supabase (USER STATE ONLY)
│   ├── Auth: Email+Password + Google Login
│   └── DB: users, progress, xp_events, srs, reflections, badges, waitlist
└── Deploy: GitHub → GitHub Actions → Vercel (Hobby, free tier)
```

---

## The 10 Laws of PM Academy

1. Markdown is the source of truth — content never in Supabase
2. Supabase stores user state only — no lesson data, ever
3. XP is append-only — write xp_events first, then recompute cache
4. Theory XP requires server-verified engagement — not client-only "mark as read"
5. Auth guard every API route — user.id from session, never from request body
6. RLS on every user-owned table — database layer, not application layer only
7. No dark patterns — no purchasable streaks, no paywalled lessons, no urgency manufacturing
8. No global leaderboard — cohort/friends-only, consistency-ranked, opt-in
9. Deploy through the pipeline only — GitHub → GitHub Actions → Vercel
10. No AI Mentor — unresolved open decision; do not build until PRD.md §11 is resolved

---

## Quick-Start Checklist for a New Session

Before writing any code in a new session:

- [ ] Loaded `00-pm-academy-core` skill
- [ ] Checked `docs/product/Phases.md` — what phase are we in?
- [ ] Checked `docs/product/PRD.md §11` — any open decisions affect this task?
- [ ] Read the relevant source-of-truth doc section for the feature area
- [ ] Confirmed this feature is in scope for the current phase

---

## Maintenance

When to update this skill system:
- A new service is added to the tech stack (update 00-core + 02-backend + 14-architect)
- A major PRD decision is made (update 00-core + 08-sprint)
- A new phase begins (update 08-sprint + 07-git)
- An architectural invariant changes (update 00-core + 14-architect)
- A significant pattern emerges in the codebase (add to the relevant specialist skill)

**This system is a living document** — update it whenever project decisions change, just like the source-of-truth docs.
