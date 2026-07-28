# PM Academy — Open-Source Starter Kits & Reference Implementations
### Curated for your exact stack: Next.js, TypeScript, Tailwind, shadcn/ui, Supabase, Vercel

All of these were verified as currently active/maintained via search rather than pulled from memory — repo landscapes shift fast, so re-check star count and last-commit date before committing to any of them, especially the smaller community projects. I've marked confidence level on each. None of these should be adopted wholesale — treat them as reference implementations to study and cherry-pick from, not frameworks to install and build on top of; your architecture is specific enough (static content pipeline, no billing, gamification-first) that a full boilerplate would fight you as much as it'd help.

---

## 1. Full-stack starting point (Next.js + Supabase + Auth)

**Official Supabase + Next.js App Router starter** — `vercel.com/templates/next.js/supabase` (backed by the Supabase GitHub org)
The single best starting point for your exact auth pattern: cookie-based auth via `supabase-ssr`, TypeScript, Tailwind, shadcn/ui pre-configured. One-click Vercel deploy that provisions the Supabase project and wires env vars automatically. **High confidence** — this is Supabase's own maintained template, so it won't drift from their actual SDK.

**KolbySisk/next-supabase-stripe-starter**
Excellent reference for structure and code quality even though you don't need the Stripe billing parts yet (defer per `PRD.md` §10). Worth studying for its `src/features/` organization pattern and its React Email + Resend integration — copy that email pattern directly, it's clean. **Medium-high confidence**, actively referenced across multiple curated lists.

Skip anything billing-first (most "SaaS starters" on GitHub are Stripe-centric) — you'd be stripping out more than you'd keep. Use these for auth/structure patterns only, not as a base to fork.

---

## 2. Spaced repetition (SM-2 algorithm)

**open-spaced-repetition/sm-2-ts** — `github.com/open-spaced-repetition/sm-2-ts`
A clean, dedicated TypeScript npm package (`@open-spaced-repetition/sm-2`) implementing the classic SM-2 algorithm with a `Scheduler`/`Card`/`ReviewLog` API. This is from the `open-spaced-repetition` GitHub org, which maintains several well-regarded spaced-repetition libraries (including the more advanced FSRS algorithm, `ts-fsrs`, if you ever want to upgrade past SM-2). **High confidence.**

Given `Rules.md`'s emphasis on correctness-testable business logic, I'd actually recommend **not** taking a dependency here and instead porting the (genuinely small, ~50-100 line) algorithm in-house, using this package's source as your reference implementation and test-case source. SM-2 is simple enough that owning it directly avoids a dependency for something core to your gamification loop, and makes it trivial to instrument with your own XP-event logging. If you do take the dependency, this is the right one.

---

## 3. Dashboard / authenticated-app UI patterns

**satnaing/shadcn-admin** (search widely referred to as "Shadcn Admin")
The most-starred shadcn-based dashboard on GitHub. Collapsible sidebar, **Cmd+K command search already built in** (directly solves the command-palette gap flagged in the Documentation Review §4), light/dark mode, RTL support. This is the single best reference for your authenticated `(app)` route group's shell (sidebar nav, header, settings pages). **High confidence**, widely cited as the current best-in-class free option.

**Kiranism/next-shadcn-dashboard-starter**
Next.js 16 + shadcn/ui + TypeScript, feature-based folder structure (`features/overview`, `features/products`, etc. — directly maps to how you'd organize `features/curriculum`, `features/progress`, `features/leaderboard`), includes a `kbar/` command-palette integration and Recharts-based analytics cards out of the box. Good second reference specifically for the dashboard/skill-radar analytics screens. **High confidence.**

Use these for **layout and interaction patterns only** — study the sidebar/command-palette/chart-card code, don't import their mock data layer or auth (you already have Supabase auth from §1).

---

## 4. Command palette (Cmd+K) — for the desktop power-user UX gap flagged in the review

**cmdk** — `github.com/pacocoursey/cmdk`
This is what shadcn/ui's own `Command` component wraps internally — meaning it's *already implicitly in your stack* the moment you install shadcn's Command component. Fast, unstyled, fuzzy search via `command-score`. This is the correct default choice for you specifically because it requires zero additional dependency decisions — just use shadcn's `<Command />` block. **High confidence, recommended primary pick.**

**timc1/kbar** — `github.com/timc1/kbar`
The alternative if you want an action-registry model (register `{id, name, shortcut, perform}` actions globally rather than composing a `Command` component per-surface) — better suited if the palette needs to trigger *actions* (jump to lesson, toggle theme, log out) rather than just *navigate*. Both `satnaing/shadcn-admin` and `Kiranism/next-shadcn-dashboard-starter` above use `kbar` specifically, so if you fork patterns from either, kbar will already be there. **High confidence**, 5,000+ stars, actively maintained.

Recommendation: start with `cmdk` via shadcn's own Command block (simplest, matches your existing shadcn/ui commitment); move to `kbar` only if you find yourself needing global keyboard shortcuts beyond a single search-and-jump palette.

---

## 5. Content pipeline (Markdown → structured JSON)

No single repo to point to here — as covered in the Documentation Review §3, your content is too structurally specific (fixed 20-section lessons, markdown tables for quiz/glossary/flashcards) for a general blog-content tool. Recommended libraries to build your custom parser *on top of*, rather than a framework to adopt wholesale:

- **remarkjs/remark** + **remark-gfm** — the standard Markdown→AST parser and GitHub-Flavored-Markdown plugin (table support). Far more robust than hand-rolled regex for extracting your quiz/glossary/flashcard tables — this is what I'd have used in this conversation's earlier content-audit work had it been building the production pipeline rather than doing one-off edits.
- **gray-matter** — trivial, extremely stable frontmatter parser, useful if you add any YAML frontmatter to lesson files (e.g., `difficulty`, `module`, `estimated_minutes` as structured metadata instead of parsed from a markdown table).

Explicitly avoid: **Contentlayer** (unmaintained since mid-2024, PRs going unmerged) and treat **Velite** with caution (actively developed and a reasonable Contentlayer replacement for blog-style content, but still early-stage per its own docs, and — like Contentlayer — optimized for frontmatter-driven prose content rather than your table-heavy structured format). Your best move is genuinely a thin custom parser built on `remark`/`remark-gfm`, not adopting either of these.

---

## 6. Transactional email

**resend/react-email** — `github.com/resend/react-email` (official, ~17k stars)
The official React-component email templating library from Resend itself. Build your streak-reminder, weekly-recap, and waitlist-confirmation emails as React components, preview them locally, and send via Resend's API. This is a direct, no-alternative-needed match for your stack since you're already using Resend. **High confidence, official.**

**resend/resend-nextjs-app-router-example** — official example repo showing the exact integration pattern (API route + React Email component + Resend SDK call) for App Router specifically, matching your Next.js version. **High confidence, official.**

---

## 7. Charts / skill radar visualization

Not re-searched this session since your existing roadmap already specifies **Recharts**, which remains the right call — it's what shadcn/ui's own official chart examples use, has a built-in `RadarChart` component (directly what your skill-radar feature needs), and has by far the largest ecosystem of shadcn-styled chart examples to reference. Don't switch to Tremor or another charting library; Recharts + shadcn's chart theming is the path of least resistance for your exact stack, and the shadcn-admin/Kiranism dashboards above both already demonstrate the pattern.

---

## 8. What I deliberately did not go looking for

- **Gamification-specific open-source repos** (XP/streak/badge systems) — I didn't find anything worth recommending here. Most "gamification framework" repos on GitHub are either abandoned, over-engineered for game contexts that don't map to a learning product, or too opinionated about their own data model to be worth adapting. Your XP/streak/skill-radar system as specified in the roadmap is simple enough (a handful of Postgres tables + straightforward business logic) that building it directly, with your own `xp_events`/`user_lesson_progress` schema, will be faster and cleaner than adapting someone else's framework. This is a build-not-borrow decision, and I'd defend it under scrutiny.
- **CMS platforms** (Sanity, Contentful, Payload, etc.) — deliberately excluded. Your content is fixed, human-authored, and versioned in Markdown in your own repo; introducing a headless CMS would be solving a content-flexibility problem you don't have, at the cost of the $0-infra-cost architecture principle that's core to your differentiation. Don't let a "CMS would make content editing easier" argument creep back in later — 90 fixed lessons don't need one.
