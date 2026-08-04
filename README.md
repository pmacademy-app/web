# PM Academy — Developer Handbook

Welcome to the **PM Academy** core workspace. This document serves as the canonical developer guide for onboarding, local development setup, architectural invariants, database migrations, and deployment workflows.

---

## 1. Project Overview & Scope

PM Academy is an interactive, gamified learning platform for product managers. It features a curated **90-lesson curriculum** divided into exactly **9 modules × 10 lessons each**. 

### Core Constraints & Architecture Philosophy
*   **₹0 Infrastructure Cost:** Built entirely on top of free tiers of Vercel, Supabase, and Resend. Designed to scale to 5,000+ active users without reaching paid ceilings.
*   **Static-First Lesson Content:** Lesson content is stored in Markdown files under `content/lessons/` (outside the web application folder) and compiled to static JSON. There is **no runtime Markdown parsing** and lesson text is **never** stored in the database.
*   **Decoupled Database Model:** The database (Supabase) stores user state only (auth profiles, lesson progress, quiz attempts, and XP). Relationships to lesson content are stored by unique, stable string keys (`lessonId` / `lessonSlug`) instead of database Foreign Keys.

---

## 2. Repository Structure

```
pm-academy/
├── .agents/                 # Workspace agent rules & custom developer skills
├── apps/
│   └── web/                # Next.js 16 Web Application (workspace code root)
│       ├── app/            # App Router pages, route groups, and API routes
│       ├── blocks/         # Custom renderable curriculum blocks (objectives, case study, etc.)
│       ├── components/     # UI primitives (shadcn), layouts, and feedback blocks
│       ├── contexts/       # React contexts (auth session, topbar breadcrumbs)
│       ├── hooks/          # Client hooks (progress, search, analytics)
│       ├── lib/            # Business services, database client, pure math logic
│       ├── renderer/       # Recursive BlockTreeRenderer & plugin registry
│       └── proxy.ts        # Next.js 16 routing middleware
├── content/
│   ├── lessons/            # 90 human-authored Markdown lesson source files
│   └── dist/               # Compiled lesson JSON files (generated)
├── docs/                   # Architectural documents, roadmaps, and invariants
│   └── memory/             # Lightweight memory logs and channellings
├── scripts/
│   └── compiler/           # AST compiler, Zod schemas, validators, registry mapping
└── supabase/
    └── migrations/         # Timestamped SQL database migrations
```

---

## 3. Tech Stack (Locked)

Do not add new dependencies or swap layers without reviewing `docs/Architecture.md §1`.

| Layer | Technology | Free-Tier Boundaries |
|---|---|---|
| **Framework** | Next.js 16 (App Router) + TypeScript 5 (Strict) | Vercel hobby limits |
| **Styling** | Tailwind CSS v4 + Framer Motion | N/A |
| **Database & Auth** | Supabase (PostgreSQL + Auth) | 500MB DB storage, 50,000 MAU |
| **Emails** | Resend SMTP | 3,000 emails/month |
| **Analytics** | Google Analytics (GA4) | N/A |
| **Search** | FlexSearch (client-side index) | Compiled at build-time |

---

## 4. Environment Variables

Create `apps/web/.env.local` containing:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-local-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-local-service-role-key

# Resend SMTP Configuration (Production Only)
RESEND_API_KEY=re_your_api_key

# Google Analytics
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

> [!CAUTION]
> **Security Rule:** `SUPABASE_SERVICE_ROLE_KEY` bypasses all Row Level Security (RLS) checks. It must **only** be imported/referenced in server environments (API routes, compile scripts). Never reference it or use it in client components.

---

## 5. Local Setup & Installation

Follow these steps to get the environment running locally:

### Step 1: Install Dependencies
From the repository root, install Node dependencies:
```bash
npm install
```

### Step 2: Configure Supabase Local Engine
We run Supabase locally via Docker. Ensure Docker Desktop is running, then start the Supabase engine:
```bash
# Initialize Supabase (only needed first time)
supabase init

# Start local services
supabase start
```
This runs PostgreSQL, Auth, S3 storage, and the local Supabase dashboard (accessible at `http://localhost:54323`).

### Step 3: Run Database Migrations
Create local tables, triggers, and Row Level Security (RLS) policies:
```bash
supabase db reset
```

### Step 4: Compile Lessons
Compile the Markdown source lessons into the JSON blocks consumed by the Next.js app:
```bash
# Execute compilation in apps/web/
npm run content:compile
```

### Step 5: Start Local Web Server
Start the Next.js Turbopack development server:
```bash
# Starts development build at http://localhost:3000
npm run dev
```

---

## 6. Content & Rendering Pipelines

### Content Compiler Pipeline
The content compiler (`scripts/compiler/compile.ts`) converts Markdown files to AST JSON structures:

```
[Markdown File] ──► [remark-parse AST] ──► [Section AST Split] ──► [Extractor Parse] ──► [Zod Check] ──► [Emit JSON]
```

1.  **Remark AST Parsing:** Raw file content is parsed using `remark-parse` into a Markdown AST structure.
2.  **Section Division:** AST is split on `h2` headings to create separate thematic sections.
3.  **Extractor Utilities:** Individual sections are processed by custom parser extractors (e.g. `quizBlock`, `flashcardBlock`) to yield type-safe metadata.
4.  **Zod Validation:** Emitted objects are verified against the Zod schema (`scripts/compiler/schema/`). A failure immediately aborts compilation.
5.  **Stable ID Registry:** Lesson IDs (e.g. `les_001_001`) are mapped deterministically against filenames via the registry (`registry.ts`).

### Rendering Pipeline
The web application uses the recursive `BlockTreeRenderer` component (`apps/web/renderer/registry.tsx`) to map compiled JSON types directly to modular React components:

*   **Registry Dispatch:** Reads the `type` of the compiled block (e.g. `keyTakeaways`, `caseStudy`, `quiz`) and dynamically resolves it to the correct visual presentation layer inside `apps/web/blocks/`.
*   **Canonical Redirects:** Lessons are accessed at `/academy/[moduleSlug]/[lessonId]`. Accessing legacy `/academy/l/[lessonId]` URLs automatically triggers a `301 Redirect` to guarantee URL canonicalization.
*   **Topbar Context:** Dynamic lesson details (names, order, module) are computed through a React `BreadcrumbContext` rather than exposing internal database IDs in the chrome header.

---

## 7. Authentication & Callback Routing

All authorization flows are handled through a single canonical callback route (`/api/auth/callback`):

```
[Client Signup / Reset] ──► [Supabase Link / OTP] ──► [/api/auth/callback] ──► [Cookie Session Setup] ──► [Final Destination]
```

### Flow 1: Signup & Verification
1.  User enters email/password in `/signup`.
2.  Supabase sends confirmation email containing a raw `token_hash` query parameter.
3.  Email link directs to `/api/auth/callback?token_hash=...&type=signup&next=/verified`.
4.  Callback handles OTP validation, synchronizes the database `users` record, saves secure HTTP-only cookies, and redirects the user to `/verified`.

### Flow 2: Password Reset
1.  User requests reset on `/reset-password`.
2.  Reset link directs to `/api/auth/callback?token_hash=...&type=recovery&next=/reset-password%3Fmode%3Dupdate`.
3.  Callback validates recovery token, establishes a server-side session, and redirects to the update password form.

### Session Cookies
Auth cookies are configured securely on the HTTP response:
*   `sb-access-token` (HttpOnly, Secure in prod, Lax, Expires at session end)
*   `sb-refresh-token` (HttpOnly, Secure in prod, Lax, MaxAge 30 days)

---

## 8. Scripts Reference (NPM Script Registry)

Run these scripts inside the `apps/web/` workspace directory:

### Core Development & Production

*   `npm run dev`
    *   **What it does:** Starts the Next.js development server with Turbopack optimization.
    *   **When to run:** During active frontend feature development.
    *   **Usage:** `npm run dev`

*   `npm run build`
    *   **What it does:** Runs `content:build` followed by `next build` to compile pages.
    *   **When to run:** Prior to deployment, or to verify production static-generation.
    *   **Usage:** `npm run build`

*   `npm run start`
    *   **What it does:** Starts the built Next.js application in production mode.
    *   **When to run:** Running production simulations locally.
    *   **Usage:** `npm run start`

*   `npm run lint`
    *   **What it does:** Runs ESLint validation checks.
    *   **When to run:** Before committing code to check style compliance.
    *   **Usage:** `npm run lint`

### Content Compilation & Validation

*   `npm run content:compile`
    *   **What it does:** Compiles markdown lessons from `content/lessons/` into static JSON inside `content/dist/`.
    *   **When to run:** After changing any Markdown source text or AST parser logic.
    *   **Usage:** `npm run content:compile`

*   `npm run content:validate`
    *   **What it does:** Runs compilation checks and schema consistency checks without writing files.
    *   **When to run:** To check compile/integrity status without affecting build artifacts.
    *   **Usage:** `npm run content:validate`

*   `npm run content:migrate`
    *   **What it does:** Triggers lesson schema key mapping migrations.
    *   **When to run:** When renaming metadata parameters across compiled lessons.
    *   **Usage:** `npm run content:migrate`

### Testing Suites

*   `npm run test:compiler`
    *   **What it does:** Executes unit tests verifying Markdown-to-AST translation, section extraction, and schema compliance.
    *   **When to run:** After modifying `scripts/compiler/compile.ts` or its Zod schemas.
    *   **Usage:** `npm run test:compiler`

*   `npm run test:parity`
    *   **What it does:** Runs parity checks between the v1 and v2 compilers to prevent content regressions.
    *   **When to run:** When testing changes to structural parser configurations.
    *   **Usage:** `npm run test:parity`

---

## 9. CI/CD Pipeline

All pushes to `main` undergo automated quality assurance via GitHub Actions (`.github/workflows/ci.yml`):

1.  **Lint & Compile Verification:** Checks source code using ESLint, runs TypeScript syntax checks, compiles lesson Markdown, and executes compiler unit/parity tests.
2.  **Page Generation Check:** Builds Next.js pages statically to verify zero dynamic data-fetch regressions.
3.  **Supabase Migration Deploy:** Deploys any new timestamped PostgreSQL migrations to production tables.

---

## 10. Phase Roadmap

*   **Phase 1 (Core Learning Loop):** Complete ✅ — Lesson renderer, quiz flow, secure server verification, custom templates.
*   **Phase 2 (Gamification Layer):** Complete ✅ — XP Engine, Timezone-aware Streak Engine, Continuous 0–100 Skill Radar, Dashboard 2.0, and SM-2 Flashcard Review Hub (`v0.2.0-phase2-complete`).
*   **Phase 3 (Social & Portfolio Infrastructure):** Current Focus 🎯 — Public Portfolios (`/p/[username]`), Capstones, Peer Feedback, Leaderboards.
*   **Phase 4 (Hardening & SEO):** Planned — Accessibility validations, search overlays, speed optimizations.

---

## 11. Core Documentation Files

For deep architectural guides, consult these documents:
*   [`docs/INDEX.md`](docs/INDEX.md) — The recommended documentation entry point.
*   [`docs/AUTH_FLOW.md`](docs/AUTH_FLOW.md) — Exact routing callback specs.
*   [`docs/Architecture.md`](docs/Architecture.md) — Detailed folder structure and schema diagrams.
*   [`docs/IMPLEMENTATION_RULES.md`](docs/IMPLEMENTATION_RULES.md) — Pre-flight coding rules and quality checks.
*   [`docs/KNOWN_ISSUES.md`](docs/KNOWN_ISSUES.md) — Deferred technical debt tracking backlog.
*   [`MEMORY.md`](MEMORY.md) — Lightweight orientation index.
