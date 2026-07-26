# PM Academy — Rules

**Status:** Living document — the operating manual for how this project is built, by whom (a solo founder, possibly assisted by AI tools/agents), and how any future contributor or AI assistant should behave when picking up this codebase.
**Companion docs:** `PRD.md` (what/why), `Architecture.md` (technical design), `Phases.md` (when), `Design.md` (what it looks like).

---

## 1. Prime Directive for Any AI Assistant or Developer Joining This Project

Before writing a single line of code or making a single product decision:

1. Read `PRD.md` fully — understand the vision, the four Product Principles, and what is explicitly out of scope.
2. Read `Architecture.md` fully — understand the locked-in stack, data model, and folder structure.
3. Read this document (`Rules.md`) fully.
4. Check `Phases.md` to know which phase the project is currently in and what "done" means for that phase.
5. Check `Design.md` before building any UI — do not invent new visual patterns ad hoc.

**Never assume a decision is up for debate just because it seems non-optimal on first read.** Every decision in these five documents was made deliberately for a solo-founder, ₹0-infra-cost, fast-execution context. If something genuinely needs to change, update the relevant document explicitly (see §7, Change Management) rather than silently deviating in code.

---

## 2. Core Engineering Philosophy

1. **Simplicity over cleverness.** If two approaches solve the problem, pick the one a solo founder (or a fresh AI assistant with no memory of past sessions) can understand in five minutes, not the one that's more "elegant."
2. **Boring technology wins.** Prefer well-documented, widely-used libraries and patterns over novel or bleeding-edge ones. The stack in `Architecture.md` §1 was chosen for exactly this reason — do not introduce a new framework, database, or paradigm without a very strong, explicitly documented reason.
3. **Free-tier discipline.** Before adding any new dependency, service, or infrastructure component, confirm it has a free tier sufficient for pre-launch and early-launch scale (see `Architecture.md` §1's table format for how to document this). If it isn't free, it doesn't go in until Section 10 monetization (`PRD.md`) makes it viable.
4. **Content is data, code is not content.** The 90 lesson Markdown files are canonical. Never hardcode lesson content into components or the database as a first-class edit surface — always go through the content pipeline (`Architecture.md` §4).
5. **Ship the smallest complete loop first.** Phase 1 (`Phases.md`) exists specifically to get a real, testable core learning loop in front of 10–20 users before any gamification is built. Do not let gamification-layer work bleed into Phase 1 scope, however tempting.
6. **No dark patterns, ever.** This is not just a product principle (`PRD.md` §1) — it's an engineering rule. Do not implement any feature that gates free content, makes cancellation/removal harder than signup, or manufactures urgency/scarcity that isn't real. If a request (from a user, a stakeholder, or a future you) asks for this, flag it against `PRD.md` §1's Product Principle #2 before building it.

---

## 3. Coding Standards

### 3.1 Language & Tooling
- **TypeScript everywhere** in `apps/web` — no plain JavaScript files for new code. Strict mode (`"strict": true`) enabled in `tsconfig.json`.
- **ESLint + Prettier** enforced via CI (`.github/workflows`) — no PR/commit should merge with lint errors. Use the standard Next.js ESLint config as the base; do not hand-roll a custom rule set unless a specific, documented problem requires it.
- **Package manager:** pick one (pnpm recommended for speed and disk efficiency) and commit the lockfile. Never mix package managers in the same repo.

### 3.2 Naming Conventions
- **Files/folders:** `kebab-case` for route segments and non-component files (`lesson-view.ts`), `PascalCase` for React component files (`LessonView.tsx`).
- **Database:** `snake_case` for all table and column names (already reflected in `Architecture.md` §2 — keep any new tables/columns consistent with this).
- **TypeScript types/interfaces:** `PascalCase` (`UserProgress`, `QuizAttempt`). Prefer `type` over `interface` unless declaration merging is specifically needed.
- **API routes:** REST-ish, resource-oriented paths (`/api/lessons/[slug]/progress`, not `/api/updateLessonProgress`).
- **Business logic modules:** match the responsibilities defined in `Architecture.md` §5 exactly (`lib/xp.ts`, `lib/srs.ts`, `lib/streaks.ts`, `lib/skillRadar.ts`, `lib/badges.ts`) — do not scatter this logic across components.

### 3.3 Component Structure
- Prefer **server components by default**; use client components (`"use client"`) only where interactivity genuinely requires it (quiz answer selection, flashcard flip, streak animations).
- Co-locate a component's styles (Tailwind classes inline) rather than separate CSS files, per the chosen stack.
- Keep components focused — a component that both fetches data, computes business logic, and renders complex UI should be split into a data-fetching layer, a `lib/` logic call, and a presentational component.

### 3.4 Testing
- Unit-test all `lib/` business logic modules (§Architecture.md §5) in isolation — especially `lib/srs.ts` (SM-2 correctness) and `lib/xp.ts` (anti-gaming rule enforcement), since bugs here directly break the product's core promises.
- Integration/E2E testing (e.g., Playwright) is a Phase 4 hardening activity (`Phases.md`), not a Phase 1 blocker — but don't skip it entirely before public launch.

### 3.5 Git Workflow
- **Trunk-based, simple branching:** `main` is always deployable. Feature branches (`feature/xp-system`, `fix/streak-timezone-bug`) merge via PR, even solo — PRs create a reviewable diff trail for future-you or a future AI assistant to read back.
- **Commit messages:** short imperative summary line (`Add SM-2 scheduling to flashcard review`), body explains *why* if not obvious.
- **CI must pass before merge:** lint, type-check, unit tests, build. Vercel preview deployments on every PR give a free, zero-config staging environment — use it.
- **Never commit secrets.** Use environment variables (`.env.local`, never committed) for all API keys (Supabase, Resend, PostHog). Document required env vars in a checked-in `.env.example`.

---

## 4. Content Authoring Rules

- Every lesson Markdown file must conform exactly to the fixed section schema in `Architecture.md` §4. Do not add ad hoc sections without updating that schema and the parser together.
- Every lesson must state an **honest** estimated time — do not inflate or deflate this to game engagement metrics (`PRD.md` §1, Product Principle #3).
- Every lesson must be tagged with 1–2 of the 7 competency clusters (`PRD.md` §3) — never 0, never 3+, to keep the skill radar meaningful.
- Quiz questions must map to a stated learning objective (used for the missed-question review queue) — no orphan questions.
- When editing existing lesson content, edit the source `.md` file and re-run the content parser (`Architecture.md` §4) — never edit the database directly.

---

## 5. Gamification Implementation Rules

These translate the `PRD.md` §4.6–§4.10 product decisions into hard engineering constraints:

1. **XP must always be traceable to an `xp_events` row.** Never increment `users.total_xp` directly in application code — write the event first, then recompute the cache (`Architecture.md` §2, §5).
2. **Theory-read XP requires server-verified engagement**, not a client-only "mark as read" flag. Verify scroll depth and active time via periodic signals sent to the server, not a single trusted client timestamp.
3. **Streak freezes are earned, never purchased.** Do not build any UI or backend path that allows spending money, XP, or any currency to buy back a streak.
4. **No global leaderboard, ever**, in this version of the product — cohort/friends-only, opt-in, weekly-reset, ranked by consistency not raw XP (`PRD.md` §4.10). If a future business reason suggests a global leaderboard, that requires a `PRD.md` amendment and explicit reconsideration of the demotivation rationale documented there — not a quiet code change.
5. **Badges are capped at ~20** and each must map to a real learning milestone (`PRD.md` §4.9's list). Do not add "participation" badges to pad the count.

---

## 6. Decision-Making Rules for a Solo Founder (with or without AI assistance)

1. **When in doubt, choose the option that ships faster without violating a Product Principle** (`PRD.md` §1). Speed beats polish at every phase before Phase 4 (`Phases.md`).
2. **Every new feature idea gets checked against three questions before being added to `Phases.md`:**
   - Does it violate any Product Principle in `PRD.md` §1?
   - Does it require a paid service, breaking the ₹0 infra rule (`Architecture.md` §1)?
   - Can a solo founder maintain it without a team, per Non-Functional Requirement "solo-founder maintainability" (`PRD.md` §5)?
   
   If the answer to the first two is "no violation" and the third is "yes," it's a candidate for a future phase. Otherwise, reject or redesign it before it enters the roadmap.
3. **Content decisions (9 vs. 10 modules, exact XP thresholds, skill radar scoring formula) are tracked in `PRD.md` §11's Open Decisions Log** — resolve them there, not in scattered code comments or chat history that gets lost.
4. **Don't rebuild what's already decided.** If a document says a decision is made, treat it as made. Reopening settled decisions (stack choices, IA structure, gamification model) without a documented, specific reason wastes the scarce time a solo founder has.

---

## 7. Change Management — How to Update These Documents

These five documents are living, but changes must be deliberate:

1. **Identify which document owns the decision** (`PRD.md` for product/what, `Architecture.md` for technical/how, `Rules.md` for process/standards, `Phases.md` for timeline, `Design.md` for visual/UX).
2. **Edit that document directly** — don't leave the decision only in a chat conversation or an external note. If it's not written in the docs, it will be lost the next time an AI assistant or contributor starts fresh.
3. **Check for ripple effects.** A change to the data model (`Architecture.md` §2) may require updating `PRD.md` §4's feature descriptions or `Phases.md`'s milestone definitions. A change to the module count (9 vs. 10) touches `PRD.md` §3, `Architecture.md` §2 and §4, and `Phases.md`'s content-audit milestone — update all of them in the same session.
4. **Append to each document's Changelog section** at the bottom with a version bump and a one-line description of what changed and why. Never silently rewrite history — future-you (or a future AI assistant) needs to understand *why* a past decision was reversed.
5. **Never let two of these documents contradict each other.** If you find a contradiction, resolve it immediately by updating whichever document is stale — do not let both stand.

---

## 8. Working Norms for AI-Assisted Development

Since this project explicitly expects to be built or continued with AI coding assistants:

- **Always state assumptions explicitly** when a requirement is ambiguous, rather than silently picking an interpretation — then update the relevant doc if the assumption becomes a real decision.
- **Prefer small, reviewable diffs** over large speculative rewrites, even when working solo with an AI assistant — this keeps the project debuggable.
- **Re-read the relevant doc section before touching a feature area you haven't touched in the current session** — context resets between sessions for AI assistants, and these documents exist specifically to eliminate that risk.
- **Do not silently introduce new services, patterns, or dependencies** outside what's documented in `Architecture.md` §1 without adding them to that document first, including their free-tier ceiling.

---

## Changelog

- v1.0 — Initial rules authored to formalize engineering philosophy, coding standards, and change-management process for a solo-founder, AI-assisted build of PM Academy.
