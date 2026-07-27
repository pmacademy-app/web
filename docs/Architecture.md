# PM Academy — Architecture

**Status:** Living document — single source of truth for technical decisions.
**Companion docs:** `PRD.md` (what/why), `Rules.md` (how we work), `Phases.md` (when), `Design.md` (what it looks like).
**Read this before writing any code.** Every choice below is optimized for one constraint set: **solo-founder buildable, low infrastructure cost, static-first architecture targeting ~5,000 users, and capable of scaling later without a rewrite.**

---

## 1. Tech Stack (locked in — do not swap components without updating this doc)

| Layer | Choice | Why | Free-tier ceiling (what triggers a paid upgrade decision) |
|---|---|---|---|
| Frontend framework | **Next.js (App Router) + TypeScript** | SSR for SEO on lesson pages, huge ecosystem, one deploy target | N/A — framework itself is free forever |
| Styling | **Tailwind CSS + shadcn/ui** | Fast, consistent, no design-system build-from-scratch cost | N/A — open source |
| Content authoring | **Markdown** — 90 source lesson files, organized by topic | Content is the single source of truth; parsed and validated at build time into static JSON | N/A — files live in the repo |
| Content delivery | **Pre-generated JSON** — built from Markdown at deploy time | No runtime markdown parsing; browser consumes static JSON assets served via Vercel Edge Network | N/A — static files served via CDN |
| Backend/API | **Next.js API routes** (or tRPC if type-safety across client/server becomes painful) | Don't over-engineer microservices for a 90-lesson MVP; one deployable unit. API routes handle user-state mutations only | N/A — same hosting as frontend |
| Database | **PostgreSQL via Supabase** | Stores **user state only**: auth, profiles, progress, XP events, quiz attempts, bookmarks, streaks, reflections, SRS state. **Never stores lesson content** — content lives in static JSON | Supabase free tier: 500MB DB, 50k monthly active users on auth, 2 free projects, 1GB file storage. Upgrade trigger: DB size or MAU approaching these ceilings — monitor via Supabase dashboard, plan the paid-tier decision (~$25/mo Pro) as a *product-success problem*, not a launch blocker. |
| Auth | **Supabase Auth** | Don't build auth yourself. Supported: **Email + Password** and **Google Login** | Same free tier as DB above |
| Hosting | **Vercel** (frontend + API routes + static JSON content) | Generous free tier (Hobby plan), automatic scaling, zero DevOps overhead, native Next.js integration. **Vercel Edge Network** provides built-in CDN for static asset delivery | Vercel Hobby: 100GB bandwidth/month, serverless function execution limits. Upgrade trigger: bandwidth or function-invocation ceilings — a success problem, revisit at Phase 5+ traffic levels. |
| Search | **Client-side search** via build-time `search-index.json` | No server-side search infrastructure needed; fast, free, zero operational cost | N/A — static file + client-side library |
| Spaced repetition | **SM-2 algorithm, implemented in-house** (~100 lines, well-documented, same core algorithm Anki uses) | No 3rd-party dependency, no cost, full control | N/A — it's your own code |
| Analytics | **Google Analytics** | Page views, user flow, conversion tracking — sufficient for MVP-scale product analytics | Free for standard usage |
| Email (transactional) | **Resend**, connected to Supabase via SMTP | Email verification, password reset, magic links, welcome emails, waitlist confirmation, streak reminders, weekly recaps | Resend free tier: 3,000 emails/month, 100/day. Upgrade trigger: user base large enough to exceed daily send volume. |
| Version control / CI-CD | **GitHub + GitHub Actions**, deploy via Vercel's native Git integration | Free for public or reasonably-sized private repos; CI/CD handles markdown validation, JSON generation, and deployment | Free tier limits are generous for a solo project; unlikely to be a constraint pre-launch |
| Design | **Figma** (free tier) | Component library, typography, color system | Free tier supports one active project sufficiently for a solo founder |

**Rule for any future addition to this stack:** before adding any new service, confirm (a) it has a free tier sufficient for pre-launch and early-launch scale, (b) it doesn't duplicate a capability already covered above, and (c) removing it later (if it stops being free or the product outgrows it) wouldn't require a rewrite of core logic. Document the addition here immediately, including its free-tier ceiling and upgrade trigger, using the same table format.

**Why not a no-code tool / off-the-shelf LMS:** Kajabi/Teachable/Thinkific are built for *paid* cohort courses, not free gamified self-serve learning, and don't give real control over a custom XP/streak/skill-radar system — which is the core differentiator. Moodle (open-source LMS) is the opposite problem: heavy, dated UX, wrong aesthetic for a "Duolingo of PM" positioning. Custom-built on the stack above is correct because the gamification mechanics *are* the product.

---

## 2. Data Model

The database stores **user state only** — authentication, profiles, progress, gamification, and social features. **Lesson content, quiz questions, and flashcards are never stored in the database** — they are served as pre-generated static JSON (see §4).

Core tables (PostgreSQL via Supabase). This is not exhaustive — extend as features in `PRD.md` §4 require, but never restructure a table listed here without checking every feature in `PRD.md` that depends on it.

```sql
-- Users & identity
users (
  id                uuid primary key default gen_random_uuid(),
  email             text unique not null,
  name              text,
  auth_provider     text not null,             -- 'email' | 'google'
  timezone          text not null default 'UTC', -- captured at signup, used for streak day-boundary calc
  goal              text,                        -- 'job_search' | 'fill_gaps' | 'exploring' (from onboarding)
  current_streak    int not null default 0,
  longest_streak     int not null default 0,
  streak_freezes_available int not null default 0,
  total_xp          int not null default 0,     -- denormalized cache, source of truth is xp_events
  level             int not null default 1,
  created_at        timestamptz not null default now()
);

-- Progress (references lessons by slug, not foreign key — content is static JSON)
user_lesson_progress (
  user_id           uuid references users(id),
  lesson_slug       text not null,               -- matches the slug in the static JSON content
  status            text not null default 'not_started', -- 'not_started' | 'in_progress' | 'completed'
  theory_read_at    timestamptz,
  quiz_score        int,
  quiz_attempts     int not null default 0,
  xp_earned         int not null default 0,
  completed_at      timestamptz,
  primary key (user_id, lesson_slug)
);

-- Quiz attempts (references questions by a stable content ID from static JSON)
quiz_attempts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references users(id),
  lesson_slug       text not null,
  question_id       text not null,               -- stable ID from the static JSON quiz data
  selected_option   int not null,
  is_correct        boolean not null,
  attempted_at      timestamptz not null default now()
);

-- Flashcard spaced repetition state (references flashcards by stable content ID)
user_flashcard_srs (
  user_id       uuid references users(id),
  flashcard_id  text not null,                   -- stable ID from the static JSON flashcard data
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
  source_id   text,                -- nullable ref to the lesson slug or content ID that triggered it
  xp_amount   int not null,
  created_at  timestamptz not null default now()
);

-- Reflections
reflections (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references users(id),
  lesson_slug text not null,
  content     text not null,
  is_public   boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Bookmarks
bookmarks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references users(id),
  lesson_slug text not null,
  created_at  timestamptz not null default now(),
  unique (user_id, lesson_slug)
);

-- Capstones
capstone_submissions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references users(id),
  module_slug   text not null,                   -- matches module slug in static JSON
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

-- Waitlist (pre-launch)
waitlist (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  email             text unique not null,
  career_position   text not null,               -- current career position
  created_at        timestamptz not null default now()
);
```

**Design notes:**
- `xp_events` is the append-only source of truth for XP; `users.total_xp` and `users.level` are denormalized caches recomputed by a trigger or application-layer function whenever a new event is inserted. Never let application code increment `total_xp` directly without writing the corresponding `xp_events` row first — this preserves auditability and makes the anti-gaming rule (`PRD.md` §4.6) verifiable after the fact.
- Row-Level Security (RLS) must be enabled on every user-owned table (`user_lesson_progress`, `quiz_attempts`, `user_flashcard_srs`, `xp_events`, `reflections`, `bookmarks`, `capstone_submissions`, `user_badges`, `cohort_members`). Policy: a user can only read/write rows where `user_id = auth.uid()`, except for explicitly `is_public` rows (reflections, capstones) which are readable by anyone for the portfolio-export feature.
- User-state tables reference content by **slug** (a stable string identifier from the static JSON), not by foreign-key UUID. This decouples user state from content — content can be rebuilt from Markdown without affecting user progress data.
- The `waitlist` table collects name, email, and current career position during the pre-launch phase.

---

## 3. Folder Structure

```
pm-academy/
├── apps/
│   └── web/                        # Main Next.js app (the product + marketing pages)
│       ├── app/                    # App Router
│       │   ├── (marketing)/        # Public routes: landing, sample lessons, waitlist
│       │   ├── (auth)/             # Sign up / log in / password reset
│       │   ├── (app)/              # Authenticated product routes
│       │   │   ├── dashboard/
│       │   │   ├── curriculum/
│       │   │   │   └── [moduleSlug]/[lessonSlug]/
│       │   │   ├── review/
│       │   │   ├── progress/
│       │   │   ├── leaderboard/
│       │   │   └── settings/
│       │   └── api/                # API routes (user-state mutations only)
│       ├── components/             # Shared React components (ui/, lesson/, quiz/, dashboard/, etc.)
│       ├── lib/                    # Business logic: xp.ts, srs.ts (SM-2), streaks.ts, skillRadar.ts
│       ├── styles/                 # Tailwind config, design tokens
│       └── public/                 # Static assets + generated JSON content
│           └── content/            # Build-generated JSON files (lessons, quizzes, flashcards)
│               └── search-index.json
├── content/                        # Source Markdown files (single source of truth)
│   ├── roadmap/
│   ├── interview/
│   ├── resume/
│   └── .../                        # Additional topic directories
├── scripts/                        # Build-time scripts
│   ├── parse-content.ts            # Markdown parser → structured JSON
│   ├── validate-content.ts         # Content validation (schema, cross-refs)
│   └── generate-search-index.ts    # Generates search-index.json
├── supabase/
│   └── migrations/                 # SQL migration files (user-state schema in §2)
├── docs/                           # This document set: PRD.md, Architecture.md, Rules.md, Phases.md, Design.md
└── .github/workflows/              # CI/CD: lint, type-check, test, markdown validation, JSON generation, deploy
```

**Key structural decisions:**
- The marketing site is folded into the main Next.js app as the `(marketing)` route group — one deploy, one domain, shared design system.
- Source Markdown lives at the repo root in `/content`, separate from the Next.js app. Build scripts process it into static JSON placed in `public/content/` for CDN delivery.
- There is no `supabase/seed.sql` — content is never seeded into the database. The database contains only migration files for user-state tables.

---

## 4. Content Pipeline (Markdown → static JSON, build-time only)

The Markdown files in `/content` are the **single source of truth**. Content is parsed, validated, and converted to static JSON at build time. **There is no runtime markdown parsing.** The browser consumes pre-generated JSON.

**Content flow:**

```
Markdown files (/content)
       ↓
  Parser (scripts/parse-content.ts)
       ↓
  Validation (scripts/validate-content.ts)
       ↓
  JSON Generation (structured lesson/quiz/flashcard JSON)
       ↓
  Search Index Generation (scripts/generate-search-index.ts → search-index.json)
       ↓
  Static Assets (placed in public/content/)
       ↓
  Vercel Deployment (served via Vercel Edge Network CDN)
```

**Fixed section schema per lesson Markdown file** (confirmed consistent across all lessons by the content audit):

```
{
  meta,                    // slug, title, module, order, difficulty, est_minutes, skill_clusters[]
  theory,                  // main prose body
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
  flashcards[],            // { id, front, back, difficulty, tags[] }
  reflection,              // prompt text
  quiz[],                  // { id, question_text, options[], correct_option, explanation, learning_objective, difficulty }
  connections[]            // cross-references to other lessons
}
```

**Pipeline rules:**
1. Every content item (quiz question, flashcard) must have a **stable `id`** field generated deterministically from its content or position — this is the key that user-state tables reference (see §2).
2. The parser script must be **re-runnable and idempotent** — re-running after editing a source Markdown file regenerates the corresponding JSON without breaking user-state references (stable IDs preserve the link).
3. The validation script enforces the schema above — a missing required field (e.g., a quiz question without an explanation) fails the build. This is the quality gate for content.
4. Build this pipeline as the **first real engineering task**, before any UI, to de-risk the content pipeline early (see `Phases.md` Phase 0).

---

## 5. Search Architecture

Search is implemented entirely at build time and runs client-side. No server-side search infrastructure.

- **Build time:** `scripts/generate-search-index.ts` processes all lesson JSON and produces a `search-index.json` file containing searchable fields (title, summary, key takeaways, glossary terms, module name).
- **Client side:** A lightweight client-side search library (e.g., Fuse.js or Lunr.js) loads the search index and provides instant, offline-capable search results.
- **No Algolia, Elasticsearch, or server-side search** — these add operational complexity and cost with no benefit at ~5,000-user scale.

---

## 6. Key Business Logic Modules

Implement these as isolated, well-tested modules in `lib/` — each should be independently unit-testable without spinning up the full app.

| Module | Responsibility | Key rule to preserve |
|---|---|---|
| `lib/xp.ts` | Computes and records XP events, updates denormalized `total_xp`/`level` | Never award Theory-read XP without verifying scroll-depth + minimum active-time server-side (client-reported dwell time alone is spoofable — verify with periodic heartbeat pings or scroll-position events sent to the API, not a single client-side timer) |
| `lib/srs.ts` | SM-2 spaced-repetition scheduling | Keep the algorithm self-contained and unit-tested against known SM-2 reference outputs; do not couple it to UI code |
| `lib/streaks.ts` | Daily streak increment/reset, freeze application | Compute "day" boundaries using the user's stored `timezone`, not server UTC midnight, or streaks will feel broken to users outside the server's timezone |
| `lib/skillRadar.ts` | Aggregates lesson/quiz/capstone performance into the 7-cluster radar score | Lock in the exact scoring formula here once decided (see `PRD.md` §11 open decision) and treat this file as the single implementation of that formula — never duplicate the calculation elsewhere |
| `lib/badges.ts` | Evaluates badge-earning conditions after relevant events | Keep the badge list and its trigger conditions in one place, matching `PRD.md` §4.9 exactly |
| `lib/search.ts` | Client-side search against the pre-built search index | Load `search-index.json` once, provide instant results — no network round-trips for search queries |

---

## 7. API Design Principles

- **Content reads are static** — lessons, quizzes, flashcards, and the search index are served as pre-generated JSON from the CDN. No API route is needed to fetch content.
- Use Next.js API routes (or route handlers under `app/api/`) for all **user-state mutations** (progress updates, XP events, flashcard reviews, capstone submissions, bookmarks).
- Every mutation endpoint must re-derive authorization from the authenticated session (via Supabase Auth) — never trust a `user_id` passed in the request body.
- Prefer server components + direct Supabase queries (with RLS enforced) for user-state reads where possible, reserving API routes for writes and for logic that needs server-only secrets (e.g., email-sending via Resend SMTP).
- Keep endpoints resource-oriented and small; avoid a single monolithic "app logic" endpoint. This keeps the codebase navigable for a solo founder or any future contributor picking it up cold.

---

## 8. Deployment Pipeline

All deployments flow through a single automated pipeline:

```
GitHub (push to main or PR)
       ↓
GitHub Actions
       ↓
  ┌─ Markdown Validation (schema check, cross-ref check)
  ├─ JSON Generation (parse-content.ts)
  ├─ Search Index Generation (generate-search-index.ts)
  ├─ Lint + Type Check + Unit Tests
  └─ Next.js Build
       ↓
Vercel Deployment (automatic via Git integration)
```

**Key rules:**
- If markdown validation fails, the build fails — broken content never reaches production.
- JSON generation runs before `next build` so that static JSON is available for Next.js to include in the build output.
- Vercel preview deployments on every PR provide a free, zero-config staging environment.
- Never commit secrets. Use environment variables (`.env.local`, never committed) for all API keys (Supabase, Resend, Google Analytics). Document required env vars in a checked-in `.env.example`.

---

## 9. Security & Privacy

- Supabase Row-Level Security enabled on every user-owned table (§2).
- Auth via Supabase Auth — never implement custom password hashing/session logic.
- Public/portfolio-export routes must only ever expose rows explicitly marked `is_public = true` — double-check this at the query layer, not just the UI layer.
- Google Analytics should be configured to anonymize IP addresses and comply with privacy regulations. No PII beyond what's operationally necessary should be sent to third-party services.
- Resend SMTP receives only the email address required for transactional sends — no additional user data.

---

## 10. Scaling Path (post-launch, only when traffic actually demands it)

This stack is chosen specifically so that scaling is a **later, success-driven decision**, not a launch blocker. The static-first architecture means most traffic is served from CDN edge nodes with zero server load.

- **Supabase free → Pro ($25/mo):** triggered by DB size or MAU approaching free-tier ceilings (§1). No migration needed — same Postgres instance, just a plan upgrade.
- **Vercel Hobby → Pro:** triggered by bandwidth/function-invocation ceilings. Same deployment model, no re-architecture.
- **Static content at the edge:** since all lesson content is pre-generated JSON served via Vercel Edge Network, content delivery scales essentially for free. The ~5,000-user MVP target is well within free-tier CDN limits.
- **Splitting the monolith (API routes → dedicated service):** explicitly deferred. Do not preemptively introduce microservices for a 90-lesson product — this is a documented rejection (see §1's "why not a no-code tool" reasoning extends to "why not microservices" for the same solo-maintainability reason).

---

## Changelog

- v2.0 — Architecture rewritten for static-first, Markdown-to-JSON build pipeline. Removed database-backed content tables (modules, lessons, quiz_questions, flashcards) — content is now pre-generated static JSON. User-state tables reference content by slug. Added search architecture (client-side, build-time index). Added deployment pipeline (GitHub Actions). Replaced PostHog with Google Analytics. Replaced LinkedIn OAuth with Email + Password and Google Login. Removed Cloudflare Pages. Added Resend SMTP integration. Added waitlist and bookmarks tables. Target: ~5,000-user MVP.
- v1.0 — Initial architecture authored from the "PM Academy — 0→1 Roadmap & Project Plan" source document, with the data model, folder structure, and content-pipeline detail expanded for direct implementation use.
