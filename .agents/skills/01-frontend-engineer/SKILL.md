---
name: pm-academy-frontend
description: >
  PM Academy frontend engineering skill. Covers Next.js 16 App Router patterns,
  TypeScript, Tailwind CSS v4, shadcn/ui, Framer Motion, and component architecture
  rules specific to this codebase. Triggers on: building UI components, pages, layouts,
  interactive elements, animations, or any work in apps/web/app/ or apps/web/components/.
---

# PM Academy — Frontend Engineering

Load `00-pm-academy-core` alongside this skill.

---

## 1. Framework Specifics

### Next.js 16 App Router
- **Use App Router exclusively.** No Pages Router patterns.
- **Server Components by default.** Only add `"use client"` when:
  - State or effects are genuinely needed (`useState`, `useEffect`, `useReducer`)
  - Browser APIs are required (scroll tracking, localStorage)
  - Event handlers that can't be server actions
  - Framer Motion animations (client-only)
- **Avoid** `"use client"` on wrapper/layout components — push it down to leaf components.
- **Server Actions** for form submissions where possible (waitlist form, reflection save). Use API routes for complex mutations with multiple DB operations.
- **Data fetching in Server Components:** use `createServerSupabaseClient()` (service role) directly. Never fetch in client components unless absolutely necessary.

### Route Groups
```
app/
├── (marketing)/    # Public. No auth. SSR for SEO. pages: /, /curriculum, /lessons/[slug], /about, /waitlist
├── (auth)/         # No auth guard. Pages: /signup, /login, /reset-password
├── (portfolio)/    # Public. No auth. Must render for logged-out viewers. /p/[username]
└── (app)/          # Auth-guarded. Redirect to /login if no session. /dashboard, /curriculum/[module]/[lesson], /review, /progress, /leaderboard, /settings
```

### File naming
- Route files: `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`
- Component files: `PascalCase.tsx` (e.g., `LessonCard.tsx`, `QuizOption.tsx`)
- Utility/lib files: `kebab-case.ts` (e.g., `lesson-utils.ts`)

---

## 2. Component Architecture

### Component hierarchy
```
components/
├── ui/           # shadcn/ui primitives (Button, Card, Dialog, Input, etc.) — DO NOT MODIFY shadcn components
├── layout/       # Nav, Footer, Sidebar, PageShell, AuthGuard
├── lesson/       # LessonCard, LessonHeader, TheorySection, MentalModelDiagram, CaseStudy, FrameworkTable, LessonNav
├── quiz/         # QuizContainer, QuizQuestion, QuizOption, QuizFeedback, QuizSummary
├── dashboard/    # SkillRadarChart, ProgressRing, StreakIndicator, XPCounter, RecentActivity, NextLessonCTA
├── flashcard/    # FlashcardDeck, FlashcardCard, SRSRatingButtons
├── marketing/    # HeroSection, FeatureGrid, SampleLesson, WaitlistForm, CurriculumPreview
└── forms/        # WaitlistForm, ReflectionForm, ProfileForm (server-action powered)
```

### Rules
- **Co-locate styles** using Tailwind inline — no separate CSS modules.
- **Keep components focused:** if a component fetches data, computes business logic, AND renders complex UI, split it.
- **Data fetching layer:** `async` server component fetches data, passes to presentational child.
- **Presentational components** receive data as props, have no direct Supabase imports.
- **Never import `createServerSupabaseClient` in a client component.** Use `createBrowserSupabaseClient` (anon key, subject to RLS) for client-side Supabase calls.

---

## 3. Tailwind CSS v4 Specifics

This project uses **Tailwind CSS v4**, which differs significantly from v3:
- Configuration is in `globals.css` using `@import "tailwindcss"` and `@theme` block — NOT a `tailwind.config.ts` file.
- Use `@theme` for custom design tokens (colors, fonts, spacing).
- No `@apply` in component files — all utility classes inline.
- PostCSS config: `@tailwindcss/postcss` plugin.

### Design Tokens (reference `app/globals.css`)
The project uses a custom color system. Always use the semantic token names, not raw Tailwind defaults:
- `--color-primary` — brand color (amber/ochre or forest green)
- `--color-correct` / `--color-incorrect` — quiz feedback states
- `--color-streak-active` / `--color-streak-inactive`
- `--color-locked` — disabled/locked module states

---

## 4. shadcn/ui Integration

- **`components.json`** is configured with the project's component settings.
- Install new shadcn components via: `npx shadcn@latest add [component-name]` (run from `apps/web/`).
- Do NOT manually modify installed shadcn components in `components/ui/`. Extend via wrapper components.
- The `@base-ui/react` package is also available as a headless alternative for complex interactive components.

---

## 5. Framer Motion Patterns

Only use Framer Motion for these **approved** animations:
1. **XP counter tick-up** — number animation after XP-earning action
2. **Streak flame pulse** — CSS animation preferred, Framer for complex variants
3. **Skill radar update** — radar chart re-drawing animation
4. **Quiz question transitions** — slide or fade between questions
5. **Celebration moments** — module complete, capstone submit, level-up, CPO completion (the ONLY 4 moments that deserve a "big" animation)

**Never** add gratuitous scroll animations, parallax effects, or micro-animations that don't serve the learning context.

### Animation pattern
```typescript
// lib/animation.ts provides shared animation variants — use these, don't create ad-hoc
import { xpCounterVariants, celebrationVariants } from '@/lib/animation'
```

---

## 6. Content Rendering (Critical)

**Content is pre-generated JSON. Never use a runtime Markdown parser.**

```typescript
// CORRECT: fetch pre-generated JSON from public/content/
const lesson = await fetch(`/content/lessons/${slug}.json`).then(r => r.json())

// WRONG: importing .md files at runtime, using react-markdown in lesson view, etc.
```

The lesson JSON structure (from `Architecture.md §4`):
- Render `theory` as HTML (it's already parsed prose in the JSON)
- `quiz[]` has `{ id, question_text, options[], correct_option, explanation }`
- `flashcards[]` has `{ id, front, back, difficulty, tags[] }`
- `glossary[]`, `resources[]`, `connections[]` are structured arrays

---

## 7. Authentication Patterns

```typescript
// Server component — get session
import { createServerSupabaseClient } from '@/lib/supabase'
const supabase = createServerSupabaseClient()
const { data: { session } } = await supabase.auth.getSession()

// Client component — browser client (respects RLS)
import { createBrowserSupabaseClient } from '@/lib/supabase'
const supabase = createBrowserSupabaseClient()

// API routes — always use service role, re-derive user from session
const supabase = createServerSupabaseClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
// Use user.id from session — never trust body.user_id
```

---

## 8. API Route Patterns

```typescript
// app/api/lessons/[slug]/progress/route.ts
export async function POST(request: Request, { params }) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  
  const body = await request.json()
  // Use user.id from session, NOT body.user_id
  // ...mutation logic...
  return Response.json({ success: true })
}
```

Route naming: `/api/lessons/[slug]/progress`, `/api/xp/record`, `/api/streaks/update`, `/api/flashcards/[id]/review`, `/api/reflections`, `/api/bookmarks`, `/api/capstones`

---

## 9. Performance Rules

- Lesson pages (`(marketing)/lessons/[slug]`) must be **SSR** for SEO. Do NOT make them client-only.
- Target **Lighthouse ≥ 90** on lesson pages (Phase 4 requirement — design for it from Phase 1).
- `search-index.json` is loaded once client-side. Cache the loaded index in module scope, not per-render.
- Static JSON content files are served via Vercel Edge Network CDN — no optimization needed for delivery, but ensure `next.config.ts` doesn't accidentally SSR them.
- Use `next/image` for all images. Never raw `<img>` tags.
- Use `next/font` for typography. No Google Fonts `<link>` tags in `<head>`.

---

## 10. Accessibility Rules (WCAG AA — non-negotiable)

- All interactive elements must have accessible labels.
- Quiz options: `role="radio"`, `aria-checked`, keyboard navigable.
- Flashcard flip: keyboard trigger (Space/Enter), `aria-label="Flip flashcard"`.
- Skill radar chart: provide a table summary alternative (`<caption>` or visually hidden table).
- Color: never use color alone to convey meaning (correct/incorrect states need icon + color).
- Focus rings: never `outline: none` without a custom visible focus indicator.
- Streak flame: `aria-label="Current streak: N days"`.
- `motion: reduce` — wrap Framer Motion animations in `useReducedMotion` hook.

```typescript
import { useReducedMotion } from 'framer-motion'
const shouldReduceMotion = useReducedMotion()
```

---

## 11. i18n Readiness

- **Never hardcode strings in components.** All user-facing text must be in dedicated string constants or a future i18n dictionary.
- Create a `lib/strings.ts` or `lib/i18n.ts` if not already present, exporting all UI strings.
- This is especially important for: gamification copy, empty states, error messages, CTAs.

---

## 12. Common Pitfalls to Avoid

1. `"use client"` on page-level components — costs you server rendering for SEO.
2. Fetching lesson content from Supabase — it's not there. Fetch from `/content/`.
3. Using `interface` when `type` is sufficient.
4. Forgetting `aria-` attributes on quiz/flashcard interactive elements.
5. Adding new shadcn components without running the CLI (risk: style mismatches).
6. Hardcoding `user_id` from request body instead of session.
7. Running Markdown parsers in the browser (they're large and unnecessary).
8. Creating `tailwind.config.ts` — this is Tailwind v4, configuration is in CSS.
