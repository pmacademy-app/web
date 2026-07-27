---
name: pm-academy-core
description: >
  Core PM Academy project skill. Loads the full project context — architecture, rules,
  design principles, data model, and non-negotiable constraints — for any AI session
  working on this codebase. This skill MUST be loaded before any other PM Academy skill.
  Triggers on: any task involving PM Academy, this codebase, or mentions of "pm academy",
  "lesson", "skill radar", "XP", "streak", "capstone", "content pipeline", or "supabase".
---

# PM Academy — Core Project Context

**Before writing a single line of code, read this entire file.**
This is the operating manual. Every rule below was made deliberately for a solo-founder,
₹0-infra-cost, fast-execution context. Do not deviate silently.

---

## 1. The Five Source-of-Truth Documents

Always cross-reference these before making decisions:

| Doc | Owns |
|-----|------|
| `docs/PRD.md` | What to build & why. Product Principles. Feature requirements. |
| `docs/Architecture.md` | Stack, data model, folder structure, content pipeline, API design. |
| `docs/Rules.md` | Engineering philosophy, coding standards, git workflow, content authoring. |
| `docs/Phases.md` | Sequencing, Definition-of-Done per phase. Current phase context. |
| `docs/Design.md` | Visual direction, component inventory, gamification UI, marketing/SEO. |

**If these docs contradict each other:** PRD wins for product behavior; Architecture wins for technical implementation.

---

## 2. Tech Stack (LOCKED — do not swap without updating Architecture.md)

| Layer | Choice |
|-------|--------|
| Framework | **Next.js 16 (App Router) + TypeScript 5 (strict mode)** |
| Styling | **Tailwind CSS v4 + shadcn/ui** |
| Content | **Markdown → build-time JSON** (NO runtime parsing) |
| Database | **Supabase PostgreSQL** — user state ONLY |
| Auth | **Supabase Auth** — Email+Password + Google Login |
| Hosting | **Vercel** (Hobby → Pro when free-tier ceiling hit) |
| Search | **Client-side** via `search-index.json` (Fuse.js or Lunr.js) |
| Email | **Resend SMTP** (connected to Supabase) |
| Analytics | **Google Analytics** |
| Animation | **Framer Motion** |
| Forms | **react-hook-form + Zod v4** |
| Icons | **lucide-react** |

**Never add a new service without:** (a) confirming free tier, (b) confirming it doesn't duplicate existing capability, (c) updating Architecture.md §1 table.

---

## 3. Non-Negotiable Architecture Rules

1. **Markdown is the single source of truth.** Content lives in `/content/lessons/`. Never store lesson content in the DB. Never hand-edit generated JSON.
2. **Static-first.** Markdown → `scripts/parse-content.ts` → `scripts/validate-content.ts` → `scripts/generate-search-index.ts` → `public/content/`. No runtime parsing.
3. **Supabase stores user state only.** Tables: `users`, `user_lesson_progress`, `quiz_attempts`, `user_flashcard_srs`, `xp_events`, `reflections`, `bookmarks`, `capstone_submissions`, `badges`, `user_badges`, `cohort_members`, `waitlist`. Content is NEVER stored here.
4. **RLS on every user-owned table.** Policy: `user_id = auth.uid()` except `is_public = true` rows.
5. **Content referenced by slug, not FK.** User-state tables link to content via `lesson_slug` (text). This decouples DB from content rebuilds.
6. **No global leaderboard.** Ever. Cohort/friends-only, opt-in, weekly-reset, ranked by consistency.
7. **No dark patterns.** No fake urgency. No streak-purchase. No paywalled lessons. Free means free.
8. **Deploy through the pipeline only.** GitHub → GitHub Actions (validate → generate → build) → Vercel. No manual deploys.
9. **XP is append-only.** Write `xp_events` row FIRST, then recompute `users.total_xp`. Never increment directly.
10. **Theory-read XP requires server verification.** Scroll-depth + active-time signals. Never trust client-only "mark as read."

---

## 4. Project Folder Structure

```
pm-academy/
├── apps/web/                   # Next.js app
│   ├── app/
│   │   ├── (marketing)/        # /, /curriculum, /lessons/[slug], /about, /waitlist
│   │   ├── (auth)/             # /signup, /login, /reset-password
│   │   ├── (portfolio)/        # /p/[username] — PUBLIC, no auth wall
│   │   ├── (app)/              # Authenticated routes (dashboard, curriculum, review, progress)
│   │   └── api/                # User-state mutations only
│   ├── components/
│   │   ├── ui/                 # shadcn/ui primitives
│   │   ├── lesson/             # Lesson-specific components
│   │   ├── quiz/               # Quiz flow components
│   │   ├── dashboard/          # Dashboard/gamification widgets
│   │   ├── marketing/          # Marketing page components
│   │   ├── layout/             # Nav, footer, shell
│   │   └── forms/              # Reusable form components
│   ├── lib/
│   │   ├── xp.ts               # XP computation + anti-gaming
│   │   ├── srs.ts              # SM-2 spaced repetition
│   │   ├── streaks.ts          # Streak logic (timezone-correct)
│   │   ├── skillRadar.ts       # 7-cluster radar scoring
│   │   ├── badges.ts           # Badge definitions + evaluation
│   │   ├── search.ts           # Client-side search
│   │   ├── supabase.ts         # Supabase clients (server + browser)
│   │   └── analytics.ts        # Google Analytics helpers
│   ├── supabase/migrations/    # SQL migration files ONLY
│   ├── public/content/         # Build-generated JSON (never edit manually)
│   └── types/                  # Shared TypeScript types
├── content/lessons/            # 90 source Markdown files (lesson-001.md → lesson-090.md)
├── scripts/
│   ├── parse-content.ts        # Markdown → JSON
│   ├── validate-content.ts     # Schema validation (fails build if broken)
│   └── generate-search-index.ts
├── docs/                       # PRD.md, Architecture.md, Rules.md, Phases.md, Design.md
└── .github/workflows/ci.yml    # GitHub Actions pipeline
```

---

## 5. Data Model Quick Reference

**User state tables (Supabase PostgreSQL):**
- `users` — id, email, name, auth_provider, timezone, goal, current_streak, longest_streak, streak_freezes_available, total_xp (cache), level
- `user_lesson_progress` — (user_id, lesson_slug) PK, status, theory_read_at, quiz_score, quiz_attempts, xp_earned, completed_at
- `quiz_attempts` — user_id, lesson_slug, question_id (from static JSON), selected_option, is_correct, attempted_at
- `user_flashcard_srs` — (user_id, flashcard_id) PK, ease_factor (SM-2), interval_days, repetitions, next_review_at
- `xp_events` — append-only ledger; source_type enum: 'theory_read'|'quiz_correct'|'quiz_bonus'|'flashcard'|'reflection'|'capstone'|'streak'
- `reflections` — lesson_slug, content, is_public
- `bookmarks` — (user_id, lesson_slug) unique
- `capstone_submissions` — module_slug, content, status, is_public
- `badges` / `user_badges` — key, name, description, icon | (user_id, badge_id)
- `waitlist` — name, email, career_position

**Key design rule:** `xp_events` is source of truth. `users.total_xp` and `users.level` are denormalized caches updated via trigger/function, never directly.

---

## 6. Content Schema (per lesson Markdown → JSON)

```typescript
{
  meta: { slug, title, module, order, difficulty, est_minutes, skill_clusters[] },
  theory, mistakes, mental_model, case_study, framework, interview_perspective,
  summary, key_takeaways, cheat_sheet,
  glossary[],        // { term, definition }
  resources[],       // { title, url, type }
  flashcards[],      // { id, front, back, difficulty, tags[] } — STABLE IDs
  reflection,        // prompt text string
  quiz[],            // { id, question_text, options[], correct_option, explanation, learning_objective, difficulty } — STABLE IDs
  connections[]      // cross-refs to other lesson slugs
}
```

**STABLE IDs rule:** `quiz[].id` and `flashcard[].id` must be deterministically generated from content/position. `user_lesson_progress`, `quiz_attempts`, `user_flashcard_srs` reference these IDs. Regenerating JSON must NOT change existing IDs.

---

## 7. XP System (exact values — do not change without updating PRD.md §4.6)

| Action | XP |
|--------|----|
| Theory read (verified scroll + dwell) | 10 |
| Quiz — per correct answer | 5 |
| Quiz — first-attempt 100% bonus | +25 |
| Flashcard review (per card, daily) | 2 |
| Reflection submitted | 15 |
| Module capstone submitted | 150 |
| Daily streak maintained | 5/day (scaling, capped) |

---

## 8. Key Business Logic Modules (lib/)

| Module | Rule |
|--------|------|
| `lib/xp.ts` | Never award Theory XP without server-verified scroll+dwell. Write xp_events row FIRST. |
| `lib/srs.ts` | SM-2 algorithm, self-contained, unit-tested. No UI coupling. |
| `lib/streaks.ts` | Day boundaries computed from `users.timezone`, NOT server UTC. |
| `lib/skillRadar.ts` | Single implementation of scoring formula. Never duplicate elsewhere. |
| `lib/badges.ts` | ~16 badges defined. Each tied to a real milestone. No filler badges. |
| `lib/search.ts` | Load `search-index.json` once. No network round-trips per query. |

---

## 9. Coding Standards

- **TypeScript strict mode everywhere** in `apps/web`. No plain JS for new code.
- **ESLint + Prettier** — CI blocks on lint errors. No custom rule sets without documented reason.
- **Package manager:** `npm` with lockfile committed (existing setup). Do not switch to pnpm without documenting the change.
- **Files/folders:** `kebab-case` for routes/non-components; `PascalCase` for React component files.
- **DB:** `snake_case` for all table/column names.
- **Types:** `PascalCase`, prefer `type` over `interface`.
- **API routes:** REST-ish, resource-oriented (`/api/lessons/[slug]/progress`, not `/api/updateLessonProgress`).
- **Server components by default.** Use `"use client"` only when interactivity genuinely requires it.
- **Never trust client-reported `user_id`** in API routes — always re-derive from authenticated session.

---

## 10. Design Direction (quick-reference)

- **Visual positioning:** Between Duolingo's playfulness and Linear/Notion's seriousness. Academic, not startup.
- **Typography:** Serif/slab for lesson headings; sans-serif for UI chrome and body.
- **Color:** One confident primary (amber/ochre or forest green — academic, not generic SaaS blue/purple). Full semantic system on top.
- **Motion:** Purposeful micro-interactions only. Celebration animations reserved for exactly: module completed, capstone submitted, level-up, CPO completion. Nothing else.
- **Skill radar:** Most prominent dashboard element. Do not let XP/streak visually dominate it.
- **No dark patterns in copy or interaction.** No urgency language. No "Don't lose your streak!!"

---

## 11. Current Phase Context

Check `docs/Phases.md` to confirm the active phase before touching any feature area.
- **Phase 0:** Foundation (content pipeline, deployment, waitlist, auth, design system)
- **Phase 1:** Core learning loop MVP (lesson view, quiz, basic progress)
- **Phase 2:** Gamification layer (XP, streaks, skill radar, flashcard SRS, dashboard)
- **Phase 3:** Depth + retention (capstones, badges, leaderboard, portfolio export, email)
- **Phase 4:** Polish, SEO, accessibility hardening + closed beta
- **Phase 5:** Public launch

**Do not build Phase N+1 features while Phase N's Definition of Done is unmet.**

---

## 12. Open Decisions (track — do not resolve in code)

| Decision | Status |
|----------|--------|
| AI Mentor feature | OPEN (CRITICAL) — see PRD.md §11. Do NOT build until resolved. |
| Skill radar scoring formula (discrete vs. continuous) | OPEN — lock in Phase 2 |
| XP thresholds per level/title | OPEN — tune in closed beta |

---

## 13. What Must NEVER Happen

1. Lesson content stored in the database.
2. Generated JSON hand-edited directly.
3. `users.total_xp` incremented without an `xp_events` row.
4. Theory-read XP awarded via client-only "mark as read."
5. A global leaderboard built (ever).
6. Streak freezes purchasable with money or XP.
7. Any of the 90 lessons paywalled.
8. New services added without updating Architecture.md §1.
9. `createServerSupabaseClient()` imported in client components.
10. Secrets committed to the repo.

---

## 14. Environment Variables (required)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=     # Server-only. NEVER expose to browser.
NEXT_PUBLIC_GA_MEASUREMENT_ID=
RESEND_API_KEY=                # Server-only.
```

Documented in `apps/web/.env.example`. Never committed to repo.

---

## 15. References

See `/docs/` for full detail on all decisions. The skill files in `.agents/skills/` extend this core context for specific task types. Load the relevant specialist skill alongside this one.
