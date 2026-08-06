# Prodigy PM Academy — Architecture

**Status:** Stable core, actively extended surface. See §0 — the blanket freeze from `v1.0.0-foundation` is now precisely scoped.
**Companion docs:** `INDEX.md` (entry point), `PRD.md` (what/why), `Rules.md` (how we work), `Roadmap.md` (when — supersedes `Phases.md` from Phase 3.7 onward), `Design.md` (what it looks like), `Brand-Architecture.md` (naming/logo), `Supabase-Migration-Guide.md` (safe schema-change workflow), `content-pipeline.md` / `rendering-pipeline.md` (authoritative compiler/renderer specs — §4/§5 defer to them), `Notification-Architecture.md` (authoritative communication architecture), `Security-Threat-Model.md`, `Performance-Budget-Checklist.md` (new — Sprint 7.5 deliverables), `Architecture-Review-Report.md` (the reasoning behind every decision in this rewrite).
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

| Layer | Choice | Why | Free-tier ceiling |
|---|---|---|---|
| Frontend framework | Next.js (App Router) + TypeScript | SSR for SEO, one deploy target | N/A |
| Styling | Tailwind CSS + shadcn/ui | Fast, consistent, no from-scratch design-system cost | N/A |
| Content authoring | Markdown — 90 source lesson files | Single source of truth; parsed/validated at build time | N/A |
| Content delivery | Pre-generated JSON via Vercel Edge Network | No runtime markdown parsing | N/A |
| Backend/API | Next.js API routes | One deployable unit; API routes handle user-state mutations only | N/A |
| Database | PostgreSQL via Supabase | User state only — never lesson content | 500MB DB, 50k MAU auth |
| Auth | Supabase Auth (Email+Password, Google) | Don't build auth yourself | Same as DB |
| Hosting | Vercel | Zero-DevOps scaling, native Next.js integration, Edge CDN | 100GB bandwidth/mo |
| Search | Client-side FlexSearch via `search-index.json` | Zero operational cost | N/A |
| Spaced repetition | In-house SM-2 (`lib/srs.ts`) | No dependency, full control | N/A |
| Analytics | Google Analytics | Sufficient for MVP-scale product analytics | Free |
| Transactional email | Resend via Supabase SMTP | Verification, resets, notifications, recap | 3,000/mo, 100/day |
| CI/CD | GitHub Actions → Vercel Git integration | Free, handles validation + JSON generation + deploy | Generous |
| Design | Figma (free tier) | Component library, typography, color system | Sufficient for solo use |

**Rule for any future addition:** confirm it has a free tier sufficient for launch scale, doesn't duplicate an existing capability, and wouldn't require a core rewrite to remove later. Document it here immediately in this table format.

### 1.1 Admin Console Security & Authorization (unchanged from Sprint 6.4.4 — reorganized in Sprint 7.4, security model untouched)

The Admin Console (`/admin`) enforces strict dual-layer authorization:

1. **Authentication & Proxy Middleware (`proxy.ts`)** — matches all `/admin/*` routes; unauthenticated → `/admin/login`; checks `ADMIN_EMAILS` env var and `user_metadata.is_admin`; non-admin authenticated users → `/admin/access-denied`.
2. **Server-Side API Guard (`requireAdminUser`)** — every `/api/admin/*` handler verifies server-side against `ADMIN_EMAILS` and `users.is_admin`; rejects with `401`/`403` and logs via `logAdminAction()`.

Sprint 7.4 reorganizes the Admin *navigation* into seven sections (Overview, Content, Users, Communications, Certificates, Feedback, System — see `Architecture-Review-Report.md §2`); this security model is unchanged and was the highest-priority regression risk flagged for that sprint.

---

## 2. Data Model

Database stores **user state only**. Lesson content, quiz questions, and flashcards are never stored in the database — served as pre-generated static JSON (§4). Core tables below; extend as `PRD.md §4` requires, never restructure without checking every dependent feature.

```sql
-- Users & identity
users (
  id                uuid primary key default gen_random_uuid(),
  email             text unique not null,
  name              text,
  auth_provider     text not null,
  timezone          text not null default 'UTC',
  goal              text,
  current_streak    int not null default 0,
  longest_streak    int not null default 0,
  streak_freezes_available int not null default 0,
  total_xp          int not null default 0,     -- denormalized cache, source of truth is xp_events
  level             int not null default 1,
  username          text unique,
  bio               text,
  avatar_url        text,
  linkedin_url      text,
  github_url        text,
  website_url       text,
  is_portfolio_public boolean not null default true,
  created_at        timestamptz not null default now()
);

-- Certificates & Completion Credentials
certificates (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references users(id) on delete cascade not null,
  certificate_code  text unique not null,
  type              text not null default 'full_curriculum',
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

-- Progress (references lessons by stable lessonId, not foreign key)
user_lesson_progress (
  user_id           uuid references users(id),
  lesson_id         text not null,               -- compiler-assigned stable lessonId (content-pipeline.md §5)
  status            text not null default 'not_started',
  theory_read_at    timestamptz,
  quiz_score        int,
  quiz_attempts     int not null default 0,
  xp_earned         int not null default 0,
  completed_at      timestamptz,
  primary key (user_id, lesson_id)
);

quiz_attempts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references users(id),
  lesson_id         text not null,
  question_id       text not null,
  selected_option   int not null,
  is_correct        boolean not null,
  attempted_at      timestamptz not null default now()
);

user_flashcard_srs (
  user_id       uuid references users(id),
  lesson_id     text not null,
  flashcard_id  text not null,
  ease_factor   numeric not null default 2.5,
  interval_days int not null default 0,
  repetitions   int not null default 0,
  next_review_at timestamptz not null default now(),
  primary key (user_id, lesson_id, flashcard_id)
);

-- XP ledger (append-only — see §0/§6. Extended Sprint 7.2 with 'user_reset' source_type)
xp_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references users(id),
  source_type text not null,      -- 'theory_read' | 'quiz_correct' | 'quiz_bonus' | 'flashcard' | 'reflection'
                                    -- | 'capstone' | 'streak' | 'user_reset' | 'admin_reset'
  source_id   text,
  xp_amount   int not null,
  created_at  timestamptz not null default now()
);

reflections (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references users(id),
  lesson_id   text not null,
  content     text not null,
  is_public   boolean not null default false,
  created_at  timestamptz not null default now()
);

bookmarks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references users(id),
  lesson_id   text not null,
  created_at  timestamptz not null default now(),
  unique (user_id, lesson_id)
);

capstone_submissions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references users(id),
  module_slug   text not null,
  content       text not null,
  status        text not null default 'submitted',
  is_public     boolean not null default false,
  submitted_at  timestamptz not null default now()
);

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

waitlist (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  email             text unique not null,
  career_position   text not null,
  created_at        timestamptz not null default now()
);
```

**Design notes:**
- `xp_events` is append-only source of truth; `users.total_xp`/`level` are recomputed caches. Never increment `total_xp` directly (§0, §6).
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

Unchanged this phase. Client-side FlexSearch, generated at build time (`content-pipeline.md §8`), consumed by `SearchOverlay` (`rendering-pipeline.md §8`). **Sprint 8.2 turns the UI on** (it was pipeline-ready but gated behind a phase boundary in the predecessor roadmap) — no architectural change, just enablement. Scalability trigger unchanged: revisit past ~2,000 lessons or measurable first-open latency impact.

---

## 6. Key Business Logic Modules

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

Unchanged. Content reads are static (no API needed). API routes handle only user-state mutations, re-derive authorization from the authenticated session (never trust a client-passed `user_id`), and stay resource-oriented and small. New routes this phase (`/api/settings/reset/*`, `/api/settings/delete-account`, `/api/feedback`, `/api/admin/feedback/[id]`, `/api/testimonials`) follow this same discipline — see the relevant sprint docs for each route's exact contract.

---

## 8. Deployment Pipeline

Unchanged — two separate GitHub Actions workflows (app pipeline, database pipeline), full detail in `Supabase-Migration-Guide.md`. The Mermaid static-SVG stage (§4) runs as part of the existing `content:compile` step, not a new workflow.

---

## 9. Security & Privacy

Base principles unchanged (RLS everywhere, Supabase Auth only, `is_public`-gated public routes, GA IP anonymization, minimal Resend PII). **Sprint 7.5 adds a standalone `Security-Threat-Model.md`** covering these principles as explicit threats with mitigations, plus verified (not assumed) rate limiting and security-headers configuration. This section remains the summary; that document is now the authoritative detail.

---

## 10. Scaling Path

Unchanged — a later, success-driven decision, not a launch blocker. Supabase free→Pro and Vercel Hobby→Pro triggers unchanged (§1). Splitting the monolith remains explicitly deferred.

---

## Changelog

- v3.0 — Prodigy PM Academy rebrand + Phase 3.7 architecture pass: added §0 (narrowed freeze scope, resolving the contradiction flagged in `Documentation-Synchronization-Report.md §1.2`); added `testimonials` table and `certificates.template_version`; documented new `lib/` modules (`brand.ts`, `settings-service.ts`, `admin/feedback-service.ts`, `certificates/linkedin-url.ts`); documented the Mermaid build-time pipeline addition; documented the Admin Console IA reorganization and Notification Panel folder changes; updated all companion-doc references (`Roadmap.md` replaces `Phases.md`, added `Brand-Architecture.md`, `Security-Threat-Model.md`, `Performance-Budget-Checklist.md`).
- v2.5 — Realigned with `content-pipeline.md`/`rendering-pipeline.md` as standalone specs. (See prior version history for full detail — preserved in version control.)
