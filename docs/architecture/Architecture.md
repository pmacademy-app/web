# Prodigy PM Academy — Architecture

**Status:** Stable core, actively extended surface. See §0 — the blanket freeze from `v1.0.0-foundation` is now precisely scoped.
**Companion docs:** `../INDEX.md` (entry point), `../product/PRD.md` (what/why), `../development/Rules.md` (how we work), `../product/Roadmap.md` (when — supersedes `Phases.md` from Phase 3.7 onward), `../design/Design.md` (what it looks like), `../product/Brand-Architecture.md` (naming/logo), `Supabase-Migration-Guide.md` (safe schema-change workflow), `content-pipeline.md` / `rendering-pipeline.md` (authoritative compiler/renderer specs — §4/§5 defer to them), `Notification-Architecture.md` (authoritative communication architecture), `Security-Threat-Model.md`, `Performance-Budget-Checklist.md` (new — Sprint 7.5 deliverables), `Architecture-Review-Report.md` (the reasoning behind every decision in this rewrite).
**Read this before writing any code.** Every choice below is optimized for: **solo-founder buildable, low infrastructure cost, static-first architecture targeting ~5,000 users, and capable of scaling later without a rewrite.**

---

## 0. Scope of the Freeze (read this before assuming anything is off-limits)

`v1.0.0-foundation` declared "core learning infrastructure" frozen. That phrase was broad enough to be misread as blocking the Phase 3.7+ work (Admin, Notifications, Settings, Certificates, Marketing, Design System) — see `Documentation-Synchronization-Report.md §1.2` for how this was discovered. It is now precisely scoped to exactly four subsystems, because these four are the ones where a change mid-flight would corrupt user data or force a costly migration:

| Frozen (do not modify without a security/severity-1 justification) | Why |
|---|---|
| **Content compiler** (`content-pipeline.md`) | 90 lessons are compiled and validated against this pipeline; changing the block taxonomy or ID scheme risks silently breaking `xp_events`/`user_lesson_progress` references. |
| **Block renderer** (`rendering-pipeline.md`) | The registry contract every lesson page depends on. |
| **`lessonId`/`blockId` stable-ID addressing** (§3.1 below) | The entire reason user progress survives content edits — changing it is a data-migration event, not a refactor. |
| **Append-only XP ledger** (§2, §6 below) | Auditability and anti-gaming guarantees depend on nothing ever writing `users.total_xp` directly — a correctness invariant, not a style preference. |

**Everything else is explicitly in scope for active redesign**: Admin Console IA, notification delivery UX, Settings structure, Certificate design, Marketing site, and the cross-product Design System. See `Architecture-Review-Report.md §1` for the full reasoning. As each of these subsystems stabilizes post-launch, re-freeze it explicitly here — a freeze that's never reapplied is an unenforced style guide, not a real invariant.

---

## 1. Tech Stack (locked — do not swap components without updating this doc)

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

### 7.5 Admin Console Security & Authorization (Sprint 6.4.4)

The Admin Console (`/admin`) enforces strict dual-layer authorization:

1. **Authentication & Proxy Middleware (`proxy.ts`)**:
   - Matches all `/admin/*` routes. Unauthenticated requests are redirected to `/admin/login`.
   - Checks `ADMIN_EMAILS` environment variable (comma-separated email list) and `user_metadata.is_admin` boolean flag.
   - Non-admin authenticated users attempting access are redirected to `/admin/access-denied`.
2. **Server-Side API Guard (`requireAdminUser`)**:
   - Every handler under `/api/admin/*` executes `requireAdminUser(request)`.
   - Performs server-side verification against `ADMIN_EMAILS` env var and Supabase `users.is_admin` column.
   - Rejects unauthorized calls with `401 Unauthorized` or `403 Forbidden` and records an audit log entry via `logAdminAction()`.

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
  username          text unique,                -- public portfolio handle (e.g. /p/johndoe)
  bio               text,                       -- public profile bio / headline
  avatar_url        text,                       -- custom avatar image URL
  linkedin_url      text,                       -- LinkedIn profile URL
  github_url        text,                       -- GitHub profile URL
  website_url       text,                       -- personal website URL
  is_portfolio_public boolean not null default true, -- portfolio privacy toggle
  created_at        timestamptz not null default now()
);

-- Certificates & Completion Credentials
certificates (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references users(id) on delete cascade not null,
  certificate_code  text unique not null,         -- deterministic code (e.g. PMA-2026-X89B2C4F)
  type              text not null default 'full_curriculum', -- 'full_curriculum' | 'module_completion'
  module_slug       text,
  learner_name      text not null,
  level             int not null default 1,
  career_title      text not null,
  total_xp          int not null default 0,
  lessons_completed int not null default 0,
  modules_completed int not null default 0,
  template_version  int not null default 1,      -- added Sprint 7.3 — pins historical certs to their original render
  issued_at         timestamptz not null default now()
);

-- Testimonials (added Sprint 7.4 — Feedback System)
testimonials (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references users(id),
  source_event      text not null,               -- 'lesson_3' | 'module_complete' | 'certificate_complete'
  content           text not null,
  status            text not null default 'pending',   -- 'pending' | 'approved' | 'rejected'
  is_published      boolean not null default false,     -- separate from 'approved' — admin can approve
                                                            -- but hold publish timing (e.g. launch week)
  reviewed_by       uuid references users(id),
  reviewed_at       timestamptz,
  created_at        timestamptz not null default now()
);

-- Progress (references lessons by stable lessonId, not foreign key — content is static JSON)
user_lesson_progress (
  user_id           uuid references users(id),
  lesson_id         text not null,               -- the compiler-assigned, stable `lessonId` (e.g. "les_001a2b") from
                                                  -- content/dist/lessons/<id>.json — see content-pipeline.md §5. Not the
                                                  -- human-facing slug: slugs may change on a title edit, lessonId never does.
  status            text not null default 'not_started', -- 'not_started' | 'in_progress' | 'completed'
  theory_read_at    timestamptz,
  quiz_score        int,
  quiz_attempts     int not null default 0,
  xp_earned         int not null default 0,
  completed_at      timestamptz,
  primary key (user_id, lesson_id)
);

-- Quiz attempts (references questions by their lesson-scoped stable content ID)
quiz_attempts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references users(id),
  lesson_id         text not null,               -- stable lessonId, see above
  question_id       text not null,               -- the quiz block's per-question `id` (e.g. "q1") from the compiled
                                                  -- JSON's `quiz` block — unique within the lesson, so always paired with lesson_id
  selected_option   int not null,
  is_correct        boolean not null,
  attempted_at      timestamptz not null default now()
);

-- Flashcard spaced repetition state (references cards by a lesson-scoped stable content ID)
user_flashcard_srs (
  user_id       uuid references users(id),
  lesson_id     text not null,                   -- stable lessonId that owns this card's flashcardDeck block
  flashcard_id  text not null,                   -- the card's per-lesson `id` (e.g. "f1") from the compiled `flashcardDeck`
                                                  -- block — unique within the lesson only, so (lesson_id, flashcard_id) is
                                                  -- the real key, matching content-pipeline.md §5's (lessonId, blockId) model
  ease_factor   numeric not null default 2.5,   -- SM-2 state
  interval_days int not null default 0,
  repetitions   int not null default 0,
  next_review_at timestamptz not null default now(),
  primary key (user_id, lesson_id, flashcard_id)
);

-- XP ledger (source of truth — users.total_xp is a denormalized cache updated from this. Extended Sprint 7.2 with 'user_reset' source_type)
xp_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references users(id),
  source_type text not null,      -- 'theory_read' | 'quiz_correct' | 'quiz_bonus' | 'flashcard' | 'reflection'
                                      -- | 'capstone' | 'streak' | 'user_reset' | 'admin_reset'
  source_id   text,                -- nullable ref to the lessonId or blockId that triggered it (content-pipeline.md §5)
  xp_amount   int not null,
  created_at  timestamptz not null default now()
);

-- Reflections
reflections (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references users(id),
  lesson_id   text not null,                     -- stable lessonId, see user_lesson_progress above
  content     text not null,
  is_public   boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Bookmarks
bookmarks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references users(id),
  lesson_id   text not null,                     -- stable lessonId, see user_lesson_progress above
  created_at  timestamptz not null default now(),
  unique (user_id, lesson_id)
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
- RLS enabled on every user-owned table, including the new `testimonials` table (policy: users read/write their own submission + `status`; `is_published = true` rows are publicly readable without auth, matching the existing `reflections`/`capstone_submissions` `is_public` pattern).
- User-state tables reference content by compiler-assigned `lessonId` (+ block-local `id` where relevant), never slug or position — this is what makes content reorganization safe.
- `certificates.template_version` (Sprint 7.3) ensures a design refresh never retroactively alters an already-issued, publicly-verifiable certificate.

---

## 3. Folder Structure

```
pm-academy/
├── apps/
│   └── web/
│       ├── app/
│       │   ├── (marketing)/        # Public: landing, sample lessons, waitlist → Marketing v2 (Sprint 8.1)
│       │   ├── (auth)/             # Sign up / log in / password reset
│       │   ├── (portfolio)/        # Public /p/[username] — is_public rows only
│       │   ├── academy/            # Authenticated curriculum shell + lesson routes (frozen, §0)
│       │   │   ├── layout.tsx
│       │   │   └── l/[lessonId]/
│       │   ├── (app)/
│       │   │   ├── dashboard/       # "What should I do next" — scoped in Sprint 7.6
│       │   │   ├── review/
│       │   │   ├── progress/        # "How have I performed" — scoped in Sprint 7.6
│       │   │   ├── leaderboard/
│       │   │   └── settings/        # Settings 2.0 — Profile/Security/Portfolio/Notifications/Danger Zone (Sprint 7.2)
│       │   ├── admin/               # Overview/Content/Users/Communications/Certificates/Feedback/System (Sprint 7.4)
│       │   └── api/
│       ├── renderer/                # frozen (§0)
│       ├── blocks/                  # frozen (§0)
│       ├── providers/
│       ├── components/
│       │   ├── brand/BrandLogo.tsx  # added Sprint 7.1 — Brand-Architecture.md §4.2
│       │   └── notifications/NotificationPanel.tsx   # added Sprint 8.4, replaces dedicated page
│       ├── lib/
│       │   ├── brand.ts             # added Sprint 7.1 — Brand-Architecture.md §3
│       │   ├── settings-service.ts  # added Sprint 7.2
│       │   ├── admin/feedback-service.ts  # added Sprint 7.4
│       │   ├── certificates/linkedin-url.ts  # added Sprint 7.3
│       │   └── ...existing modules (§6)
│       ├── theme/                   # tokens.ts — single design-token source (Design.md, rewritten this phase)
│       └── styles/
├── content/                         # frozen (§0) — content-pipeline.md is authoritative
│   ├── modules/
│   ├── shared/snippets/
│   ├── schema/
│   ├── .ids/lesson-id-registry.json
│   ├── compiler/                    # +Mermaid-to-static-SVG stage, added Sprint 7.1
│   └── dist/
├── supabase/
│   └── migrations/
├── docs/                            # this document set
│   ├── sprints/                     # per-sprint specs, Sprint-7.1 through Sprint-8.6
│   └── memory/
└── .github/workflows/
```

**Key structural decisions (unchanged from prior version unless noted):**
- Marketing folded into `(marketing)` route group — one deploy, one domain, shared design system.
- Portfolio/certificate export needs its own unauthenticated `(portfolio)` route group — `is_public = true` enforced at the query layer (§2, §9), not route-level auth.
- Curriculum/lesson routes live under `app/academy/**`, keyed by stable `lessonId` — frozen per §0.
- `NotificationPanel` (Sprint 8.4) replaces a dedicated notifications page/route — no new route, a persistent slide-over component instead.
- `admin/` gains the seven-section IA from Sprint 7.4 — same route root, reorganized nav.

---

## 4. Content Pipeline (frozen scope, §0 — one additive stage this phase)

**Authoritative spec:** `content-pipeline.md`. Unchanged this phase except for one additive compiler stage:

**Mermaid Strategy (Sprint 7.1):** Mermaid diagrams move from client-side runtime rendering to build-time static SVG generation, styled from `theme/tokens.ts`, as an additional `content:compile` stage. This is additive to the pipeline (a new stage, not a change to the block taxonomy or ID scheme), so it does not touch anything covered by the §0 freeze. Rationale and trade-offs: `Architecture-Review-Report.md §6`.

Everything else in this section — the remark/mdast parser, block extraction, stable `lessonId`/`blockId` addressing, per-lesson validation isolation, incremental content-addressed builds — is unchanged and frozen. See the original pipeline flow diagram in `content-pipeline.md §1`.

---

## 5. Search Architecture

Search is implemented entirely at build time and runs client-side. No server-side search infrastructure by default. Full detail: `content-pipeline.md` §8 (index generation) and `rendering-pipeline.md` §8 (search UI).

- **Build time:** the content compiler's Stage 7 (`content-pipeline.md` §8) emits a `searchable` payload per lesson (plain-text-extracted body, headings, tags, module, difficulty) and feeds every lesson into a **[FlexSearch](https://github.com/nextapp-au/flexsearch)** index serialized to `content/dist/search-index.json` — no separate, hand-maintained search-index script.
- **Client side:** `SearchOverlay` (triggered by `Cmd/Ctrl+K`) loads the FlexSearch index lazily on first open, not on initial page load, and provides instant, offline-capable results. Results are **block-aware**: selecting one deep-links to `(lessonId, blockId)` and scrolls to/highlights that block, not just the lesson root.
- **Optional adapter:** the same documents can be pushed to Algolia/Typesense instead, if/when catalog size or fuzzy/typo-tolerant search at scale warrants it.
- **Scalability trigger — when to revisit FlexSearch-only:** client-side FlexSearch is the right call at 90 lessons. Revisit (consider the Algolia/Typesense adapter) only if lesson count exceeds roughly 2,000 (`content-pipeline.md` §13) or the generated `search-index.json` grows large enough to noticeably affect first-open latency — below that, a hosted search service is solving a problem you don't have yet, at real infra cost you currently avoid entirely.

---

## 6. Key Business Logic Modules

Implement these as isolated, well-tested modules in `lib/` — each should be independently unit-testable without spinning up the full app.

| Module | Responsibility | Key rule to preserve |
|---|---|---|
| `lib/xp.ts` | Engagement verification, XP constants | Dwell-time + scroll-depth thresholds; all gamification values |
| `lib/xp-service.ts` | Canonical XP service | Sole writer to `xp_events` |
| `lib/lessons-completion-service.ts` | Lesson completion orchestration | State transitions, unlock checks |
| `lib/flashcards-service.ts` | Flashcard SRS orchestration | SM-2 updates, DB coordination |
| `lib/lessons-db.ts` | Lesson DB operations | Theory reads, quiz attempts, reflections |
| `lib/streaks-db.ts` | Streak DB updates | Timezone-correct |
| `lib/srs.ts` | SM-2 math | Self-contained, unit-tested, no UI coupling |
| `lib/streaks.ts` | Streak calculation engine | User-timezone day boundaries, not server UTC |
| `lib/skillRadar.ts` | 7-cluster competency scoring | Single implementation of the locked formula (`PRD.md §4.8`) |
| `lib/badges.ts` | Badge-earning evaluation | Matches `PRD.md §4.9`'s list exactly, capped ~20 |
| `lib/brand.ts` | **New, Sprint 7.1** | Centralized brand config — `Brand-Architecture.md §3` |
| `lib/settings-service.ts` | **New, Sprint 7.2** | Ledger-respecting reset/delete orchestration |
| `lib/admin/feedback-service.ts` | **New, Sprint 7.4** | Testimonial moderation state transitions |
| `lib/certificates/linkedin-url.ts` | **New, Sprint 7.3** | Pure function, LinkedIn add-to-profile URL |
| `components/search-overlay.tsx` + `lib/search.ts` | Client-side FlexSearch UI | Lazy-load index on first `Cmd/Ctrl+K` open |

---

## 7. API Design Principles

- **Content reads are static** — lessons, quizzes, flashcards, and the search index are served as pre-generated JSON from the CDN. No API route is needed to fetch content.
- Use Next.js API routes (or route handlers under `app/api/`) for all **user-state mutations** (progress updates, XP events, flashcard reviews, capstone submissions, bookmarks).
- Every mutation endpoint must re-derive authorization from the authenticated session (via Supabase Auth) — never trust a `user_id` passed in the request body.
- Prefer server components + direct Supabase queries (with RLS enforced) for user-state reads where possible, reserving API routes for writes and for logic that needs server-only secrets (e.g., email-sending via Resend SMTP).
- Keep endpoints resource-oriented and small; avoid a single monolithic "app logic" endpoint. This keeps the codebase navigable for a solo founder or any future contributor picking it up cold.

---

## 8. Deployment Pipeline

**Two separate pipelines in one GitHub Actions workflow** (`ci.yml`), not one — this was tightened after the initial single-pipeline description below turned out to be inaccurate once the database migration pipeline was actually built out (see `Supabase-Migration-Guide.md`). Keeping them separate is the right call, not just what happened: app code and database schema have different risk profiles and different rollback procedures, and coupling them into one job would mean a flaky content-validation step could block an urgent database fix, or vice versa.

**App pipeline** (content + Next.js app, triggers on every push/PR):
```
GitHub (push to main or PR)
       ↓
GitHub Actions — ci.yml (job: build-and-validate)
       ↓
  ┌─ Content Validation (`content:validate` — schema, referential, accessibility rule-plugin registry; per-lesson, non-blocking — content-pipeline.md §4, §10, §11)
  ├─ Content Compile (`content:compile` — incremental, content-addressed; produces content/dist/lessons/*.json, curriculum.json, module-graph.json)
  ├─ Search Index Generation — part of `content:compile`'s Stage 7/8 output (`search-index.json`, `glossary-index.json`) from Phase 4 onward only; see `Phases.md`. Earlier phases skip enabling the search UI, not the pipeline stage itself, which runs on every compile regardless of phase.
  ├─ Lint + Type Check + Unit Tests
  └─ Next.js Build
       ↓
Vercel Deployment (automatic via Git integration)
```

CI restores/saves `content/.cache/manifest.json` as a cache artifact between runs, so a PR touching one lesson doesn't recompile the whole catalog (`content-pipeline.md` §11).

**Database pipeline** (schema changes only, triggers on push/merge to `main`):
```
GitHub (push/merge to main)
       ↓
GitHub Actions — ci.yml (job: deploy-supabase, main only)
       ↓
  npx supabase db push (applies new migrations from supabase/migrations/)
```
Full workflow, local testing, rollback, and CI secrets setup: `Supabase-Migration-Guide.md`. That document is authoritative for *how* to change the schema safely; this section and §2/§9 are authoritative for *what* the schema and its RLS policies must be.

**Key rules:**
- Content validation is **per-lesson, not whole-build** (`content-pipeline.md` §4, §10): a lesson with an `error`-severity issue is excluded from `content/dist/` and flagged in the build report, but does not block the other lessons from shipping. CI can be configured to fail the pipeline run only if error-count > 0 (strict) or only on lessons touched in the current PR (fast-iteration mode) — either way, broken content for one lesson never silently reaches production undetected, and it never takes the rest of the catalog down with it.
- Content compilation runs before `next build` so that static JSON is available for Next.js to include in the build output.
- Vercel preview deployments on every PR provide a free, zero-config staging environment.
- Database migrations never run automatically on a PR preview — only on merge to `main`, per `Supabase-Migration-Guide.md` §3.3. A PR should never be able to alter the production schema before review.
- Never commit secrets. Use environment variables (`.env.local`, never committed) for all API keys (Supabase, Resend, Google Analytics). Document required env vars in a checked-in `.env.example`.

---

## 9. Security & Privacy

Base principles unchanged (RLS everywhere, Supabase Auth only, `is_public`-gated public routes, GA IP anonymization, minimal Resend PII). **Sprint 7.5 adds a standalone `Security-Threat-Model.md`** covering these principles as explicit threats with mitigations, plus verified (not assumed) rate limiting and security-headers configuration. This section remains the summary; that document is now the authoritative detail.

---

## 10. Scaling Path

This stack is chosen specifically so that scaling is a **later, success-driven decision**, not a launch blocker. The static-first architecture means most traffic is served from CDN edge nodes with zero server load.

- **Supabase free → Pro ($25/mo):** triggered by DB size or MAU approaching free-tier ceilings (§1). No migration needed — same Postgres instance, just a plan upgrade.
- **Vercel Hobby → Pro:** triggered by bandwidth/function-invocation ceilings. Same deployment model, no re-architecture.
- **Static content at the edge:** since all lesson content is pre-generated JSON served via Vercel Edge Network, content delivery scales essentially for free. The ~5,000-user MVP target is well within free-tier CDN limits.
- **Splitting the monolith (API routes → dedicated service):** explicitly deferred. Do not preemptively introduce microservices for a 90-lesson product — this is a documented rejection (see §1's "why not a no-code tool" reasoning extends to "why not microservices" for the same solo-maintainability reason).

---

## Changelog

- v3.0 — Prodigy PM Academy rebrand + Phase 3.7 architecture pass: added §0 (narrowed freeze scope, resolving the contradiction flagged in `Documentation-Synchronization-Report.md §1.2`); added `testimonials` table and `certificates.template_version`; documented new `lib/` modules (`brand.ts`, `settings-service.ts`, `admin/feedback-service.ts`, `certificates/linkedin-url.ts`); documented the Mermaid build-time pipeline addition; documented the Admin Console IA reorganization and Notification Panel folder changes; updated all companion-doc references (`Roadmap.md` replaces `Phases.md`, added `Brand-Architecture.md`, `Security-Threat-Model.md`, `Performance-Budget-Checklist.md`).
- v2.6 (2026-08-06) — Documentation structure pass: §8 corrected to match the real CI layout — the app and database pipelines are two jobs (`build-and-validate`, `deploy-supabase`) in one workflow file, `ci.yml`, not the previously-named separate `app-deploy.yml` / `supabase-deploy.yml` files (which never existed). Companion-docs header updated to the new subfolder paths.
- v2.5 — Realigned with the new, standalone technical specs `content-pipeline.md` and `rendering-pipeline.md`, which now supersede this document's prior content-pipeline detail wherever they conflict. §3: replaced the old flat `content/{roadmap,interview,resume,...}` layout and `public/content/` output with the real `content/modules/**` + `content/dist/**` source/output layout, and updated the app-side folder structure to the `app/academy/**` route + `renderer/`/`blocks/` structure the rendering spec actually calls for (was still showing `app/(app)/curriculum/[moduleSlug]/[lessonSlug]/`). §4: replaced the fixed 20-field flat lesson schema and single-script pipeline description with a summary of the real block-tree compiler (remark/mdast, pattern-matching extractors, content-addressed IDs, per-lesson validation, plugin architecture) — this doc's content-pipeline detail is now a pointer to the authoritative spec, not a competing description. §5: replaced the unspecified Fuse.js/Lunr.js client search library with FlexSearch and added block-aware deep-linking, matching what the two new specs actually build. §8: corrected the deployment pipeline's error-handling rule, which previously said any validation failure aborts the whole build — the real model (per `content-pipeline.md` §4/§10) excludes only the failing lesson and ships the rest. §2: renamed `lesson_slug` to `lesson_id` across all user-state tables (referencing the compiler-assigned stable `lessonId`, not the human-facing slug) and added lesson-scoped flashcard/quiz keys, matching `content-pipeline.md` §5's stable-identifier model — this was a real, previously-undocumented conflict between this doc's slug-based references and the new spec's `(lessonId, blockId)` addressing.
- v2.4 — Updated §3 and §6 to register the newly isolated domain service layers (xp-service.ts, lessons-completion-service.ts, flashcards-service.ts) and clean feature database helpers (lessons-db.ts, streaks-db.ts).
- v2.3 — Reconciled §8 with the real, separately-built database migration workflow: split the "single pipeline" into an app pipeline and a database pipeline, cross-referenced the new `Supabase-Migration-Guide.md`, and corrected search-index generation to only run from Phase 4 onward (was incorrectly shown as universal, contradicting the Phase 1→4 move already made in `Phases.md`).
- v2.2 — Lean-documentation pass: added explicit scalability trigger for client-side search (revisit past ~300 lessons or ~2MB gzipped index) so the tradeoff has a concrete decision point rather than being implicit.
- v2.1 — Documentation review pass: added missing `(portfolio)` public route group for the unauthenticated portfolio/certificate export feature (`PRD.md` §4.11), which had no route in the folder structure despite being a required v1 feature.
- v2.0 — Architecture rewritten for static-first, Markdown-to-JSON build pipeline. Removed database-backed content tables (modules, lessons, quiz_questions, flashcards) — content is now pre-generated static JSON. User-state tables reference content by slug. Added search architecture (client-side, build-time index). Added deployment pipeline (GitHub Actions). Replaced PostHog with Google Analytics. Replaced LinkedIn OAuth with Email + Password and Google Login. Removed Cloudflare Pages. Added Resend SMTP integration. Added waitlist and bookmarks tables. Target: ~5,000-user MVP.
- v1.0 — Initial architecture authored from the "PM Academy — 0→1 Roadmap & Project Plan" source document, with the data model, folder structure, and content-pipeline detail expanded for direct implementation use.
