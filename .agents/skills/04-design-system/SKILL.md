---
name: pm-academy-design-system
description: >
  PM Academy UI/UX design system skill. Covers visual direction, design tokens,
  component specifications, gamification UI rules, accessibility, and the marketing
  site design. Triggers on: UI design questions, new component creation, visual/UX
  decisions, design system tokens, marketing page layout, or any task where design
  direction needs to be confirmed before implementation.
---

# PM Academy — Design System & UI/UX

Load `00-pm-academy-core` alongside this skill.

---

## 1. Design Positioning

> "The rigor of a b-school elective, the habit-forming feel of a language-learning app."

Visual language sits between **Duolingo's playfulness** and **Linear/Notion's seriousness**.
- NOT: full cartoon-mascot territory (undermines b-school credibility)
- NOT: sterile-corporate SaaS (kills the habit loop)
- YES: Academic confidence with just enough warmth and dynamism

**Primary references:** Duolingo (habit mechanics), Linear (typography precision), Notion (information density), Khan Academy (educational credibility).

---

## 2. Typography

| Use | Typeface | Notes |
|-----|----------|-------|
| Lesson headings (H1, H2) | Serif or high-quality slab (e.g., Fraunces, Playfair Display) | Signals "real course," not generic SaaS |
| UI chrome, body text | Clean sans-serif (Inter or Outfit via `next/font`) | Readable, modern, professional |
| Code/terminal snippets | JetBrains Mono or similar monospace | For any technical content sections |

**Load fonts via `next/font`** — no Google Fonts `<link>` tags anywhere.

### Type Scale (Tailwind v4 tokens in globals.css)
```css
@theme {
  --font-heading: 'Fraunces', serif;
  --font-body: 'Inter', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
}
```

---

## 3. Color System

**Primary brand:** One confident, distinct color — **amber/ochre** or **forest green**. Not generic SaaS blue or purple. Decide once, lock into `globals.css`, do not deviate.

```css
@theme {
  /* Brand — ONE of these, pick and lock in */
  --color-primary: oklch(0.65 0.15 60);       /* Amber/ochre example */
  /* --color-primary: oklch(0.45 0.10 145); */ /* Forest green example */
  
  /* Semantic colors */
  --color-correct: oklch(0.55 0.15 145);      /* Green — quiz correct, completed */
  --color-incorrect: oklch(0.55 0.20 25);     /* Red — quiz incorrect, error */
  --color-streak-active: oklch(0.65 0.18 45); /* Orange — active streak flame */
  --color-streak-inactive: oklch(0.75 0 0);   /* Gray — streak at risk */
  --color-locked: oklch(0.80 0 0);            /* Gray — locked modules */
  --color-warning: oklch(0.70 0.15 85);       /* Yellow — caution states */
  
  /* Surfaces */
  --color-background: oklch(0.98 0 0);        /* Near-white */
  --color-surface: oklch(0.96 0 0);           /* Card backgrounds */
  --color-border: oklch(0.88 0 0);            /* Subtle dividers */
  
  /* Text */
  --color-text-primary: oklch(0.15 0 0);      /* Near-black */
  --color-text-secondary: oklch(0.45 0 0);    /* Muted text */
  --color-text-disabled: oklch(0.70 0 0);     /* Disabled states */
}
```

**WCAG AA verification required** before finalizing the primary brand color for text use cases. Verify contrast ratio ≥ 4.5:1 for body text, ≥ 3:1 for large text.

---

## 4. Component Inventory

The list below defines the full set of components to build. The order within each section reflects recommended build priority — earlier items unlock real user testing sooner.

> These are the components the project needs, not necessarily all already built. Check the codebase before creating duplicates.

### Foundation
- **Typography** — `h1` through `h6`, `p`, `small`, `code`, `kbd` styles
- **Button** — variants: primary, secondary, ghost, destructive; sizes: sm, md, lg; states: default, hover, active, disabled, loading
- **Input** — text, email, textarea; states: default, focus, error, disabled
- **Card** — base card, lesson card (with progress state), module card (with lock state), badge card

### Learning
- **LessonCard** — title, module, difficulty badge, estimated time, progress status (not started / in progress / completed), lock state
- **ModuleCard** — module number, title, lesson count, completion percentage, lock/unlock state
- **QuizOption** — states: default, selected, correct, incorrect (icon + color, not color alone for a11y)
- **QuizQuestion** — question text + 4 QuizOption children + feedback slot
- **FlashcardCard** — front/back flip animation (keyboard accessible), difficulty rating buttons

### Gamification
- **ProgressRing** — circular progress indicator, animated on update
- **SkillRadarChart** — radar/spider chart with 7 axes, animates on data change, exportable as image
- **StreakIndicator** — flame icon + day count; active/at-risk/inactive variants; no dark-pattern language
- **XPCounter** — current XP + level/title display; tick-up animation on XP gain
- **LevelUpToast** — celebration animation for genuine level-up milestone only
- **BadgeGrid** — earned (full color) and unearned (subtle silhouette) badge display

### Navigation
- **MainNav** — authenticated app navigation (dashboard, curriculum, review, progress, leaderboard)
- **Sidebar** — persistent side navigation for authenticated routes
- **MarketingNav** — public marketing site navigation
- **LessonNav** — within-lesson navigation (prev/next, module breadcrumb)
- **SearchInput** — instant search with results dropdown (client-side, Fuse.js)

### Flashcard
- **FlashcardDeck** — deck session manager, queue display
- **SRSRatingButtons** — quality 0–5 rating buttons (post-flip)

### Marketing
- **HeroSection** — positioning statement + CTA (waitlist pre-launch, "Start Free" post-launch)
- **FeatureGrid** — "How it works" section
- **WaitlistForm** — name + email + career_position; minimal friction
- **SampleLessonPreview** — teaser of a real lesson for marketing pages

---

## 5. Motion Design Rules

**Principle:** Purposeful and rare. Motion reinforces the learning loop — it doesn't entertain.

### Approved Animations Only

| Animation | Trigger | Character |
|-----------|---------|-----------|
| XP counter tick-up | After XP-earning action | Quick number increment, ~300ms |
| Streak flame pulse | When streak is active | Subtle CSS keyframe, always running |
| Skill radar update | After lesson/quiz/capstone | Smooth path transition, ~600ms |
| Quiz question slide | Next question | Slide-in from right, ~200ms |
| Lesson card unlock | When module unlocks | Scale + fade-in, ~400ms |
| **Level-up celebration** | Level/title change | Full celebration — confetti OK here |
| **Module completion** | Module completed | Full celebration |
| **Capstone submission** | Capstone submitted | Full celebration |
| **CPO completion** | All 90 lessons + 9 capstones | The biggest moment — biggest animation |

**Celebration moments are exactly these 4.** Adding "100 XP milestone" confetti or "streak milestone" animations cheapens the real celebrations and trains users to expect constant reward.

### useReducedMotion — Required in Every Animated Component
```typescript
import { useReducedMotion } from 'framer-motion'

export function AnimatedXPCounter({ targetXP }: { targetXP: number }) {
  const shouldReduceMotion = useReducedMotion()
  
  // Skip animation entirely when prefers-reduced-motion is set
  if (shouldReduceMotion) {
    return <span>{targetXP} XP</span>
  }
  
  // Framer Motion animation
  return <motion.span /* ... */ />
}
```

---

## 6. Skill Radar Chart Specification

The skill radar is the **most important UI element in the entire product** (PRD.md §2). Do not deprioritize it or make it secondary to XP/streak visually.

**7 axes (exact names — use consistently):**
1. Discovery & Research
2. Strategy
3. Design & UX
4. Execution & Delivery
5. Metrics & Growth
6. Leadership & Communication
7. Platform/Technical/Specialized

**Design requirements:**
- Must be the single most prominent element on the dashboard (visually largest, positioned first/center)
- Must animate smoothly when a value changes (radar polygon transitions, ~600ms)
- Must be legible as a standalone image for portfolio export (clean, no clutter, branded)
- Provide a table alternative for screen-reader accessibility (visually hidden `<table>` with the same data)
- Color: filled area in primary brand color with low opacity; axis lines in border color

---

## 7. Gamification UI Copy Rules (no dark patterns)

### Streak Copy
- ✅ "4-day streak — you're building a habit!"
- ✅ "Study today to keep your streak going."
- ✅ "You have 1 streak freeze available."
- ❌ "Don't lose your streak!!"
- ❌ "Your streak is in danger! Act now!"
- ❌ "Buy a streak freeze to save your progress."

### XP & Levels
- Show level number AND career title together: "Level 4 — Senior PM"
- Level-up copy: celebratory but grounded — "You've earned Senior PM. Your skills show it."
- Do not position XP as a number to maximize — frame it as "your learning reflected in numbers."

### Badges
- Earned badges: full color + name + description
- Unearned badges: subtle silhouette (motivates without nagging)
- Do NOT show progress toward unearned badges ("4 more correct quizzes for this badge") — this gamifies the wrong behavior

### Leaderboard
- Label the metric clearly: "Days studied this week" — not raw XP rank
- Opt-in toggle must be easy to find AND easy to turn off
- Never show the user's rank relative to people not in their cohort

---

## 8. Marketing Site Layout

**Site structure:**
```
/ (Home)
├── Hero: positioning + CTA
├── The gap: fragmented free vs. $200-$2000 paid vs. PM Academy
├── How it works: 9 modules, 90 lessons, skill radar, streaks
├── Sample lesson previews (3-5 public lessons)
├── "Free forever" explainer
└── Footer CTA + waitlist form

/curriculum          — public, indexable, SEO asset
/lessons/[slug]      — SSG with generateStaticParams, structured data
/about               — founder story, why-free narrative
/waitlist            — pre-launch; minimal friction; name + email + career position
```

**Marketing site design rules:**
- Lead with the positioning line and the "gap" narrative — this is the core story
- Never use inflated claims — be specific and honest (per Product Principle #3)
- "Free forever" section must be explicit and prominent — it's the #1 trust signal
- Sample lesson pages must show REAL lesson content, not marketing copy

---

## 9. Responsive Design Rules

- **Desktop-first design target** — authenticated app experiences are designed for desktop first
- **Mobile must work fully** — responsive, not just "not broken"
- **Marketing site must feel great on mobile** — many visitors will be on phones
- Breakpoints: `sm` (640px), `md` (768px), `lg` (1024px), `xl` (1280px) — Tailwind defaults
- Lesson reading view: comfortable line length (`max-w-prose` / ~65ch) on desktop; full-width on mobile
- Skill radar chart: minimum size of 300×300px even on small screens

---

## 10. Accessibility Checklist (WCAG AA — every component)

- [ ] Color contrast ≥ 4.5:1 for body text, ≥ 3:1 for large text
- [ ] Never convey information through color alone (add icon or label)
- [ ] All interactive elements keyboard-navigable (Tab, Space, Enter, Arrow keys where appropriate)
- [ ] Focus rings visible (never `outline: none` without a visible replacement)
- [ ] All images have descriptive `alt` text (or `alt=""` for decorative)
- [ ] Quiz options: `role="radiogroup"` on container, `role="radio"`, `aria-checked`, keyboard navigable
- [ ] Flashcard flip: Space/Enter triggers flip, `aria-label` on the flip button
- [ ] Skill radar chart: table summary alternative (visually hidden, accessible to screen readers)
- [ ] Streak indicator: `aria-label="N-day streak"`
- [ ] Level/XP displays: meaningful `aria-label`s
- [ ] Form inputs: labels via `htmlFor`/`id`, error messages via `aria-describedby`
- [ ] Modal/dialog: focus trap, `role="dialog"`, `aria-labelledby`
- [ ] Skip-to-content link at the top of every page layout
- [ ] `useReducedMotion` wrapping all Framer Motion animations

---

## 11. Component Build Order (priority for each phase)

Build these in order — each unlocks real user testing before the next:
1. Waitlist page (live independently in Week 1)
2. Auth pages (sign up, log in, reset — clean, brand-consistent)
3. Lesson reading view (most-used screen — get this right first)
4. Quiz flow (question → feedback → explanation → next)
5. Dashboard (progress ring, skill radar, streak, "continue" CTA)
6. Module/curriculum map (lock/unlock state)
7. Flashcard review session (card-flip, SM-2 queue)
8. Search experience (integrated into nav)
9. Onboarding flow (goal-setting after signup)
