---
name: pm-academy-frontend
description: >
  PM Academy frontend engineering skill. Covers Next.js App Router patterns,
  TypeScript, Tailwind CSS v4, shadcn/ui, Framer Motion, and component architecture
  rules specific to this codebase. Triggers on: building UI components, pages, layouts,
  interactive elements, animations, or any work in apps/web/app/ or apps/web/components/.
---

# PM Academy — Frontend Engineering

Load `00-pm-academy-core` alongside this skill.

---

## 1. Framework: Next.js App Router

### Core Rules
- **Use App Router exclusively.** No Pages Router patterns, no `getServerSideProps`, no `getStaticProps`.
- **Server Components by default.** Only add `"use client"` when genuinely required:
  - `useState`, `useEffect`, `useReducer`, `useRef` — state or lifecycle
  - Browser APIs (scroll tracking, `localStorage`, `window`)
  - Event handlers that cannot be Server Actions
  - Framer Motion animations (client-only library)
  - `useReducedMotion`, custom hooks that use any of the above
- **Never** add `"use client"` to layout, page, or wrapper components — push it down to the smallest leaf that actually needs it.
- **Server Actions** for simple form submissions (waitlist form, reflection save). Use API routes for complex mutations involving multiple DB operations or business logic.
- **Data fetching:** `async` server components call `createServerSupabaseClient()` directly. Never fetch user state in client components unless you have a specific real-time requirement.

### Next.js 16 — Critical API Difference
In Next.js 16, route params are **async**. Always `await` them:

```typescript
// ✅ CORRECT — Next.js 16
export default async function LessonPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  // ...
}

// Also for generateMetadata:
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  // ...
}

// ❌ WRONG — Next.js 13/14/15 pattern, will fail in Next.js 16
export default async function LessonPage({ params }: { params: { slug: string } }) {
  const lesson = await getLesson(params.slug) // params.slug may be undefined
}
```

### Route Groups
```
app/
├── (marketing)/    # Public. No auth. SSG for lesson pages. pages: /, /curriculum, /lessons/[slug], /about, /waitlist
├── (auth)/         # No auth guard. Pages: /signup, /login, /reset-password
├── (portfolio)/    # Public. No auth. Must render for logged-out viewers. /p/[username]
├── (app)/          # Auth-guarded. Redirect to /login if no session.
│   ├── dashboard/
│   ├── curriculum/[moduleSlug]/[lessonSlug]/
│   ├── review/
│   ├── progress/
│   ├── leaderboard/
│   └── settings/
└── onboarding/     # Post-signup goal-setting (before dashboard)
```

### File Naming
- Route files: `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`
- Component files: `PascalCase.tsx` (e.g., `LessonCard.tsx`, `QuizOption.tsx`)
- Utility/lib files: `kebab-case.ts` (e.g., `lesson-utils.ts`)
- Hook files: `use-kebab-case.ts` (e.g., `use-xp.ts`) — stored in `hooks/`

---

## 2. Component Architecture

### Component Hierarchy
```
components/
├── ui/           # shadcn/ui primitives (Button, Card, Dialog, Input, etc.) — DO NOT MODIFY
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
- **Data fetching layer:** `async` server component fetches data, passes to presentational child as props.
- **Presentational components** receive data as props, have no direct Supabase imports.
- **Never import `createServerSupabaseClient` in a client component.** Use `createBrowserSupabaseClient` for any client-side Supabase calls.

### Custom Hooks (hooks/)
Keep custom hooks in `hooks/` — not inside components. Hooks extract stateful logic for reuse:

```typescript
// hooks/use-xp.ts — example custom hook
'use client'
import { useState, useCallback } from 'react'

export function useXPAnimation() {
  const [displayXP, setDisplayXP] = useState(0)
  const animateTo = useCallback((target: number) => {
    // tick-up animation logic
  }, [])
  return { displayXP, animateTo }
}
```

---

## 3. Tailwind CSS v4

This project uses **Tailwind CSS v4**, which differs significantly from v3:
- Configuration is in `app/globals.css` using `@import "tailwindcss"` and `@theme` block — **NOT a `tailwind.config.ts` file.**
- Use `@theme` for custom design tokens (colors, fonts, spacing).
- No `@apply` in component files — all utility classes inline.
- PostCSS config: `@tailwindcss/postcss` plugin.
- **Never create `tailwind.config.ts`** — this breaks Tailwind v4.

### Design Tokens (always use semantic names, never raw Tailwind defaults)
```css
/* Reference these from globals.css @theme block */
--color-primary         /* brand color */
--color-correct         /* quiz correct / completed */
--color-incorrect       /* quiz incorrect / error */
--color-streak-active   /* active streak flame */
--color-streak-inactive /* streak at risk */
--color-locked          /* disabled/locked module states */
--color-background      /* page background */
--color-surface         /* card backgrounds */
--color-border          /* dividers */
--color-text-primary    /* near-black */
--color-text-secondary  /* muted text */
--font-heading          /* serif/slab for lesson headings */
--font-body             /* sans-serif for UI chrome */
--font-mono             /* monospace for code snippets */
```

---

## 4. shadcn/ui Integration

- **`components.json`** is configured with the project's settings.
- Install new shadcn components via: `npx shadcn@latest add [component-name]` (run from `apps/web/`).
- Do NOT manually modify installed shadcn components in `components/ui/`. Extend via wrapper components.

---

## 5. Framer Motion

Only use Framer Motion for these **approved** animations. Nothing else.

| Animation | Trigger | Notes |
|-----------|---------|-------|
| XP counter tick-up | After XP-earning action | ~300ms number increment |
| Streak flame pulse | When streak is active | Subtle CSS keyframe preferred |
| Skill radar update | After lesson/quiz completion | ~600ms path transition |
| Quiz question slide | Moving to next question | ~200ms slide from right |
| Lesson card unlock | Module unlocks | ~400ms scale + fade |
| **Level-up celebration** | Level/title change | Full celebration — the real milestone |
| **Module completion** | Module completed | Full celebration |
| **Capstone submission** | Capstone submitted | Full celebration |
| **CPO completion** | All 90 lessons + 9 capstones | The biggest moment — biggest celebration |

**Never** add scroll-triggered animations, parallax effects, or micro-animations not in this table.

### useReducedMotion — ALWAYS required
```typescript
import { useReducedMotion } from 'framer-motion'

export function AnimatedComponent() {
  const shouldReduceMotion = useReducedMotion()
  
  return (
    <motion.div
      animate={shouldReduceMotion ? {} : { scale: 1.05 }}
      // ...
    />
  )
}
```

---

## 6. Content Rendering (Critical)

**Content is pre-generated JSON. Never use a runtime Markdown parser.**

```typescript
// ✅ CORRECT — fetch from public/content/ (served from Vercel Edge CDN)
const lesson = await fetch(`/content/lessons/${slug}.json`).then(r => r.json())

// In Server Components, read the file directly for SSG:
import { readFile } from 'fs/promises'
import path from 'path'

async function getLessonJSON(slug: string) {
  const filePath = path.join(process.cwd(), 'public/content/lessons', `${slug}.json`)
  const raw = await readFile(filePath, 'utf-8')
  return JSON.parse(raw)
}

// ❌ WRONG
import ReactMarkdown from 'react-markdown'  // Never
import lessonContent from '../content/lesson-001.md'  // Never
```

---

## 7. Authentication Patterns

```typescript
// ✅ Server Component — get authenticated user
import { createServerSupabaseClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'

const supabase = createServerSupabaseClient()
const { data: { user }, error } = await supabase.auth.getUser()  // Use getUser(), NOT getSession()
if (!user) redirect('/login')

// ✅ API Routes — ALWAYS use getUser() to verify session
export async function POST(request: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = user.id  // Always from session — NEVER from request body
  // ...
}

// ✅ Client Component — browser client (subject to RLS)
import { createBrowserSupabaseClient } from '@/lib/supabase'
const supabase = createBrowserSupabaseClient()

// ❌ WRONG — getSession() is deprecated and insecure for authorization
const { data: { session } } = await supabase.auth.getSession()  // DO NOT USE for auth checks
```

> **Why `getUser()` not `getSession()`?** `getSession()` returns cached data that can be stale or spoofed. `getUser()` always re-validates the JWT with Supabase Auth servers, making it the only safe choice for authorization.

---

## 8. API Route Patterns

```typescript
// app/api/lessons/[slug]/progress/route.ts
import { createServerSupabaseClient } from '@/lib/supabase'
import { NextRequest } from 'next/server'
import { z } from 'zod'

const bodySchema = z.object({
  status: z.enum(['in_progress', 'completed']),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }  // Promise in Next.js 16
) {
  const supabase = createServerSupabaseClient()
  
  // 1. Auth guard — always FIRST
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  // 2. Validate input with Zod
  const body = await request.json()
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  
  // 3. Async params in Next.js 16
  const { slug } = await params
  
  // 4. Business logic via lib/ — not inline
  // ...
  
  return Response.json({ success: true })
}
```

### Route Naming Conventions
```
/api/lessons/[slug]/progress       # GET, PATCH
/api/lessons/[slug]/theory-read    # POST (server-verify theory read + XP)
/api/lessons/[slug]/quiz           # POST (record quiz attempt + XP)
/api/flashcards/[id]/review        # POST (update SRS state)
/api/streaks/update                # POST
/api/reflections                   # GET, POST
/api/reflections/[id]              # PATCH, DELETE
/api/bookmarks                     # GET, POST
/api/bookmarks/[slug]              # DELETE
/api/capstones                     # GET, POST
/api/capstones/[id]                # PATCH
/api/waitlist                      # POST (public, no auth)
```

---

## 9. Performance Rules

- **Lesson pages** (`(marketing)/lessons/[slug]`) must use `generateStaticParams` for SSG. Serve from CDN, not SSR per-request.
- Target **Lighthouse ≥ 90** on lesson and marketing pages.
- `search-index.json` is loaded once client-side. Cache in module scope, not per render.
- Use `next/image` for all images. Never raw `<img>` tags.
- Use `next/font` for typography. No Google Fonts `<link>` tags in `<head>`.
- Import individual icons from `lucide-react` — not the full package.
- Import individual Framer Motion components — not the entire library.
- Static JSON content files are CDN-served — ensure `next.config.ts` doesn't accidentally SSR them.

---

## 10. Accessibility Rules (WCAG AA — non-negotiable)

- All interactive elements must have accessible labels.
- Quiz options: `role="radio"`, `aria-checked`, keyboard navigable (arrow keys).
- Flashcard flip: keyboard trigger (Space/Enter), `aria-label="Flip flashcard"`.
- Skill radar chart: provide a table summary alternative for screen readers.
- Color: never use color alone to convey meaning (quiz correct/incorrect needs icon + color).
- Focus rings: never `outline: none` without a visible custom focus indicator.
- Streak indicator: `aria-label="Current streak: N days"`.
- `useReducedMotion` wrapping all Framer Motion animations (see §5).
- Skip-to-content link at the top of every page.
- All `<img>` (via `next/image`) must have descriptive `alt` text (or `alt=""` for decorative).
- Form inputs: labels associated via `htmlFor`/`id`; errors via `aria-describedby`.

---

## 11. Common Pitfalls to Avoid

1. `"use client"` on page-level components — costs you static/server rendering.
2. Fetching lesson content from Supabase — it's not there; fetch from `/content/*.json`.
3. Using `getSession()` for authorization — always use `getUser()`.
4. Forgetting `await params` in Next.js 16 route handlers.
5. Adding new shadcn components without running the CLI (risk: style mismatches).
6. Trusting `user_id` from request body — always use `user.id` from `getUser()`.
7. Running Markdown parsers in the browser (they're large and unnecessary).
8. Creating `tailwind.config.ts` — this is Tailwind v4; configuration is in CSS.
9. Using `interface` when `type` is sufficient.
10. Hardcoding user-facing strings — keep them in `lib/strings.ts` or a constants file for future i18n readiness.
