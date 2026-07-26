# PM Academy — Architecture

**Status:** Living document — single source of truth for technical decisions.
**Companion docs:** `PRD.md` (what/why), `Rules.md` (how we work), `Phases.md` (when), `Design.md` (what it looks like).
**Read this before writing any code.** Every choice below is optimized for one constraint set: **solo-founder buildable, ₹0 infrastructure cost at launch, and capable of scaling later without a rewrite.**

---

## 1. Tech Stack (locked in — do not swap components without updating this doc)

| Layer | Choice | Why | Free-tier ceiling (what triggers a paid upgrade decision) |
|---|---|---|---|
| Frontend framework | **Next.js (React) + TypeScript**, App Router | SSR for SEO on lesson pages, huge ecosystem, one deploy target | N/A — framework itself is free forever |
| Styling | **Tailwind CSS + shadcn/ui** | Fast, consistent, no design-system build-from-scratch cost | N/A — open source |
| Content authoring | **Markdown/MDX** — 90 source `lesson-NNN.md` files | Content is already structured; treat as a real pipeline, not hardcoded pages | N/A — files live in the repo |
| Backend/API | **Next.js API routes** (or tRPC if type-safety across client/server becomes painful) | Don't over-engineer microservices for a 90-lesson MVP; one deployable unit | N/A — same hosting as frontend |
| Database | **PostgreSQL via Supabase** | Relational fits perfectly (users, progress, XP events, quiz attempts, SRS state); Supabase bundles auth + row-level security | Supabase free tier: 500MB DB, 50k monthly active users on auth, 2 free projects, 1GB file storage. Upgrade trigger: DB size or MAU approaching these ceilings — monitor via Supabase dashboard, plan the paid-tier decision (~$25/mo Pro) as a *product-success problem*, not a launch blocker. |
| Auth | **Supabase Auth** | Don't build auth yourself. Email + Google OAuth + LinkedIn OAuth | Same free tier as DB above |
| Hosting (app) | **Vercel** (frontend + API routes) | Generous free tier (Hobby plan), automatic scaling, zero DevOps overhead, native Next.js integration | Vercel Hobby: 100GB bandwidth/month, serverless function execution limits. Upgrade trigger: bandwidth or function-invocation ceilings — again, a success problem, revisit at Phase 5+ traffic levels. |
| Hosting (marketing site) | **Vercel** (separate project) or **Cloudflare Pages** | Kept as a *separate deployable* from the main app so it can ship in Week 1 independent of app architecture decisions | Free tier, same as above |
| Spaced repetition | **SM-2 algorithm, implemented in-house** (~100 lines, well-documented, same core algorithm Anki uses) | No 3rd-party dependency, no cost, full control | N/A — it's your own code |
| Analytics | **PostHog** (cloud free tier) | Product analytics + session replay + feature flags in one tool | PostHog free tier: 1M events/month. Upgrade trigger: event volume approaching this — a scale problem, not a launch concern. |
| Email (transactional) | **Resend** | Streak reminders, weekly recap, re-engagement | Resend free tier: 3,000 emails/month, 100/day. Upgrade trigger: user base large enough to exceed daily send volume. |
| Version control / CI-CD | **GitHub + GitHub Actions**, deploy via Vercel's native Git integration | Free for public or reasonably-sized private repos; CI/CD without extra infra | Free tier limits are generous for a solo project; unlikely to be a constraint pre-launch |
| Design | **Figma** (free tier) | Component library, typography, color system | Free tier supports one active project sufficiently for a solo founder |

**Rule for any future addition to this stack:** before adding any new service, confirm (a) it has a free tier sufficient for pre-launch and early-launch scale, (b) it doesn't duplicate a capability already covered above, and (c) removing it later (if it stops being free or the product outgrows it) wouldn't require a rewrite of core logic. Document the addition here immediately, including its free-tier ceiling and upgrade trigger, using the same table format.

**Why not a no-code tool / off-the-shelf LMS:** Kajabi/Teachable/Thinkific are built for *paid* cohort courses, not free gamified self-serve learning, and don't give real control over a custom XP/streak/skill-radar system — which is the core differentiator. Moodle (open-source LMS) is the opposite problem: heavy, dated UX, wrong aesthetic for a "Duolingo of PM" positioning. Custom-built on the stack above is correct because the gamification mechanics *are* the product.

---

## 2. Data Model

Core tables (PostgreSQL via Supabase). This is not exhaustive — extend as features in `PRD.md` §4 require, but never restructure a table listed here without checking every feature in `PRD.md` that depends on it.

```sql
-- Users & identity
users (
  id                uuid primary key default gen_random_uuid(),
  email             text unique not null,
  name              text,
  auth_provider     text not null,             -- 'email' | 'google' | 'linkedin'
  timezone          text not null default 'UTC', -- captured at signup, used for streak day-boundary calc
  goal              text,                        -- 'job_search' | 'fill_gaps' | 'exploring' (from onboarding)
  current_streak    int not null default 0,
  longest_streak     int not null default 0,
  streak_freezes_available int not null default 0,
  total_xp          int not null default 0,     -- denormalized cache, source of truth is xp_events
  level             int not null default 1,
  created_at        timestamptz not null default now()
);

-- Curriculum structure
modules (
  id        uuid primary key default gen_random_uuid(),
  order_index int not null unique,
  title     text not null,
  theme     text
);

lessons (
  id                uuid primary key default gen_random_uuid(),
  module_id         uuid not null references modules(id),
  order_in_module   int not null,
  slug              text unique not null,        -- used for public lesson-preview URLs
  title             text not null,
  difficulty        text,                        -- 'beginner' | 'intermediate' | 'advanced'
  est_minutes       int not null,
  content_mdx_ref   text not null,                -- path/ref to the parsed MDX body (see §4)
  skill_clusters    text[] not null,              -- 1-2 of the 7 competency clusters, see PRD §3
  is_public_preview boolean not null default false -- true for the 3-5 SEO/marketing sample lessons
);

-- Progress
user_lesson_progress (
  user_id           uuid references users(id),
  lesson_id         uuid references lessons(id),
  status            text not null default 'not_started', -- 'not_started' | 'in_progress' | 'completed'
  theory_read_at    timestamptz,
  quiz_score        int,
  quiz_attempts     int not null default 0,
  xp_earned         int not null default 0,
  completed_at      timestamptz,
  primary key (user_id, lesson_id)
);

-- Quiz
quiz_questions (
  id                  uuid primary key default gen_random_uuid(),
  lesson_id           uuid references lessons(id),
  question_text       text not null,
  options             jsonb not null,             -- array of option strings
  correct_option      int not null,               -- index into options
  explanation         text not null,
  learning_objective  text,
  difficulty          text
);

quiz_attempts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references users(id),
  quiz_question_id  uuid references quiz_questions(id),
  selected_option   int not null,
  is_correct        boolean not null,
  attempted_at      timestamptz not null default now()
);

-- Flashcards / spaced repetition
flashcards (
  id          uuid primary key default gen_random_uuid(),
  lesson_id   uuid references lessons(id),
  front       text not null,
  back        text not null,
  difficulty  text,
  tags        text[]
);

user_flashcard_srs (
  user_id       uuid references users(id),
  flashcard_id  uuid references flashcards(id),
  ease_factor   numeric not null default 2.5,   -- SM-2 state
  interval_days int not null default 0,
  repetitions   int not null default 0,
  next_review_at timestamptz not null default now(),
  primary key (user_id, flashcard_id)
);

-- XP ledger (source of truth — users.total_xp is a denormalized cache updated from this)
xp_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references users(id),
  source_type text not null,      -- 'theory_read' | 'quiz_correct' | 'quiz_bonus' | 'flashcard' | 'reflection' | 'capstone' | 'streak'
  source_id   uuid,                -- nullable ref to the lesson/quiz/capstone that triggered it
  xp_amount   int not null,
  created_at  timestamptz not null default now()
);

-- Reflections
reflections (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references users(id),
  lesson_id   uuid references lessons(id),
  content     text not null,
  is_public   boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Capstones
capstone_submissions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references users(id),
  module_id     uuid references modules(id),
  content       text not null,
  status        text not null default 'submitted', -- 'submitted' | 'reviewed' (future: expert review)
  is_public     boolean not null default false,      -- for portfolio export
  submitted_at  timestamptz not null default now()
);

-- Badges
badges (
  id          uuid primary key default gen_random_uuid(),
  key         text unique not null,
  name        text not null,
  description text not null,
  icon        text not null
);

user_badges (
  user_id     uuid references users(id),
  badge_id    uuid references badges(id),
  earned_at   timestamptz not null default now(),
  primary key (user_id, badge_id)
);

-- Leaderboard (opt-in, cohort-based)
cohorts (
  id          uuid primary key default gen_random_uuid(),
  name        text
);

cohort_members (
  cohort_id   uuid references cohorts(id),
  user_id     uuid references users(id),
  joined_at   timestamptz not null default now(),
  primary key (cohort_id, user_id)
);
```

**Design notes:**
- `xp_events` is the append-only source of truth for XP; `users.total_xp` and `users.level` are denormalized caches recomputed by a trigger or application-layer function whenever a new event is inserted. Never let application code increment `total_xp` directly without writing the corresponding `xp_events` row first — this preserves auditability and makes the anti-gaming rule (`PRD.md` §4.6) verifiable after the fact.
- Row-Level Security (RLS) must be enabled on every user-owned table (`user_lesson_progress`, `quiz_attempts`, `user_flashcard_srs`, `xp_events`, `reflections`, `capstone_submissions`, `user_badges`, `cohort_members`). Policy: a user can only read/write rows where `user_id = auth.uid()`, except for explicitly `is_public` rows (reflections, capstones) which are readable by anyone for the portfolio-export feature.
- `lessons.is_public_preview` flags the 3–5 lessons published pre-launch for SEO/credibility (`PRD.md` §8). These render via a public route with no auth required.

---

## 3. Folder Structure

```
pm-academy/
├── apps/
│   ├── web/                        # Main Next.js app (the product)
│   │   ├── app/                    # App Router
│   │   │   ├── (marketing)/        # Public routes: landing, sample lessons, waitlist
│   │   │   ├── (auth)/             # Sign up / log in / onboarding
│   │   │   ├── (app)/              # Authenticated product routes
│   │   │   │   ├── dashboard/
│   │   │   │   ├── curriculum/
│   │   │   │   │   └── [moduleSlug]/[lessonSlug]/
│   │   │   │   ├── review/
│   │   │   │   ├── progress/
│   │   │   │   ├── leaderboard/
│   │   │   │   └── settings/
│   │   │   └── api/                # API routes (server-side logic)
│   │   ├── components/             # Shared React components (ui/, lesson/, quiz/, dashboard/, etc.)
│   │   ├── lib/                    # Business logic: xp.ts, srs.ts (SM-2), streaks.ts, skillRadar.ts
│   │   ├── content/                # 90 source lesson-NNN.md files (canonical content, see §4)
│   │   ├── scripts/                # Content parser, migration/seed scripts (see §4)
│   │   ├── styles/                 # Tailwind config, design tokens
│   │   └── public/                 # Static assets
│   └── marketing-site/             # OPTIONAL separate deployable if kept fully independent of the app
│       └── ... (only if you decide not to fold marketing into apps/web's (marketing) group — see Design.md §6 for the decision)
├── supabase/
│   ├── migrations/                 # SQL migration files (schema in §2 lives here, versioned)
│   └── seed.sql                    # Generated from the content parser output, re-runnable
├── docs/                           # This document set: PRD.md, Architecture.md, Rules.md, Phases.md, Design.md
└── .github/workflows/              # CI/CD (lint, type-check, test, deploy)
```

**Decision:** default to keeping the marketing site as the `(marketing)` route group inside `apps/web` for simplicity (one deploy, one domain, shared design system) **unless** the waitlist page needs to ship in Week 1 before the main app's Next.js scaffolding exists — in that case, stand up `apps/marketing-site` as a minimal standalone Next.js (or even static HTML) deploy first, and fold its routes into `apps/web` once the main app is scaffolded. Document whichever path is taken in `Phases.md` Phase 0.

---

## 4. Content Pipeline (source Markdown → structured app data)

The 90 lesson Markdown files are the **canonical source of truth**. The database is a **rebuildable cache**. Never hand-edit lesson content in the database.

**Fixed section schema per `lesson-NNN.md`** (confirmed consistent across all 90 files by the content audit):

```
{
  meta,                    // title, module, order, difficulty, est_minutes, skill_clusters[]
  theory_mdx,              // main prose body, MDX-compatible
  mistakes,                // common-mistakes section
  mental_model,            // diagram/framework description
  case_study,
  framework,               // framework table
  interview_perspective,
  summary,
  key_takeaways,
  cheat_sheet,
  glossary[],
  resources[],
  flashcards[],            // { front, back, difficulty, tags[] }
  reflection,              // prompt text
  quiz[],                  // { question_text, options[], correct_option, explanation, learning_objective, difficulty }
  connections[]            // cross-references to other lessons
}
```

**Pipeline steps:**
1. A parser script (`scripts/parse-content.ts` or `.py`) walks every `content/lesson-NNN.md`, extracts each fixed section via the header structure above, and outputs structured JSON per lesson.
2. This JSON is the seed data for `lessons`, `quiz_questions`, `flashcards` (and their fields) — a migration/seed script (`supabase/seed.sql`, generated from the JSON) populates the database.
3. **This script must be re-runnable and idempotent** — re-running it after editing a source MD file should update the corresponding DB rows without duplicating them (use `slug` or a stable lesson ID as the upsert key), so content edits never require manual DB surgery.
4. Because the content structure is this disciplined, this entire pipeline is automatable instead of requiring manual data entry for 90 lessons — build this parser as the **first real engineering task**, before any UI, to de-risk the content pipeline early (see `Phases.md` Phase 0).

---

## 5. Key Business Logic Modules

Implement these as isolated, well-tested modules in `lib/` — each should be independently unit-testable without spinning up the full app.

| Module | Responsibility | Key rule to preserve |
|---|---|---|
| `lib/xp.ts` | Computes and records XP events, updates denormalized `total_xp`/`level` | Never award Theory-read XP without verifying scroll-depth + minimum active-time server-side (client-reported dwell time alone is spoofable — verify with periodic heartbeat pings or scroll-position events sent to the API, not a single client-side timer) |
| `lib/srs.ts` | SM-2 spaced-repetition scheduling | Keep the algorithm self-contained and unit-tested against known SM-2 reference outputs; do not couple it to UI code |
| `lib/streaks.ts` | Daily streak increment/reset, freeze application | Compute "day" boundaries using the user's stored `timezone`, not server UTC midnight, or streaks will feel broken to users outside the server's timezone |
| `lib/skillRadar.ts` | Aggregates lesson/quiz/capstone performance into the 7-cluster radar score | Lock in the exact scoring formula here once decided (see `PRD.md` §11 open decision) and treat this file as the single implementation of that formula — never duplicate the calculation elsewhere |
| `lib/badges.ts` | Evaluates badge-earning conditions after relevant events | Keep the badge list and its trigger conditions in one place, matching `PRD.md` §4.9 exactly |

---

## 6. API Design Principles

- Use Next.js API routes (or route handlers under `app/api/`) for all server-side mutations (progress updates, XP events, flashcard reviews, capstone submissions).
- Every mutation endpoint must re-derive authorization from the authenticated session (via Supabase Auth) — never trust a `user_id` passed in the request body.
- Prefer server components + direct Supabase queries (with RLS enforced) for reads where possible, reserving API routes for writes and for logic that needs server-only secrets (e.g., email-sending via Resend).
- Keep endpoints resource-oriented and small; avoid a single monolithic "app logic" endpoint. This keeps the codebase navigable for a solo founder or any future contributor picking it up cold.

---

## 7. Security & Privacy

- Supabase Row-Level Security enabled on every user-owned table (§2).
- Auth via Supabase Auth — never implement custom password hashing/session logic.
- Public/portfolio-export routes must only ever expose rows explicitly marked `is_public = true` — double-check this at the query layer, not just the UI layer.
- No third-party analytics or email tooling should receive PII beyond what's operationally necessary (e.g., email address for Resend sends, anonymized/aliased IDs for PostHog where feasible).

---

## 8. Scaling Path (post-launch, only when traffic actually demands it)

This stack is chosen specifically so that scaling is a **later, success-driven decision**, not a launch blocker:

- **Supabase free → Pro ($25/mo):** triggered by DB size or MAU approaching free-tier ceilings (§1). No migration needed — same Postgres instance, just a plan upgrade.
- **Vercel Hobby → Pro:** triggered by bandwidth/function-invocation ceilings. Same deployment model, no re-architecture.
- **Read replicas / caching (e.g., edge caching of public lesson pages):** only consider once organic SEO traffic (a stated goal, `PRD.md` §9) is large enough to matter — Next.js's built-in static/ISR rendering for public lesson pages should absorb significant scale before this is needed.
- **Splitting the monolith (API routes → dedicated service):** explicitly deferred. Do not preemptively introduce microservices for a 90-lesson product — this is a documented rejection (see §1's "why not a no-code tool" reasoning extends to "why not microservices" for the same solo-maintainability reason).

---

## Changelog

- v1.0 — Initial architecture authored from the "PM Academy — 0→1 Roadmap & Project Plan" source document, with the data model, folder structure, and content-pipeline detail expanded for direct implementation use.
