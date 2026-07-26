# PM Academy — Marketing Website

A production-quality standalone Next.js marketing site implementing every design and content specification faithfully. Built to serve as the front door for PM Academy, with a fully integrated, lightweight waitlist system powered by Supabase.

---

## Technical Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: TailwindCSS v4
- **UI Components**: Radix Primitives via shadcn/ui
- **Animation**: Framer Motion
- **Database**: Supabase
- **Analytics**: Google Analytics 4 (GA4) with Google Tag Manager support

---

## Folder Structure

```
apps/web/
├── app/                     # Next.js app directory (App Router)
│   ├── (marketing)/         # Marketing routes group (Navbar + Footer layout wrapper)
│   │   ├── layout.tsx
│   │   └── page.tsx         # Marketing landing page (all 12 sections)
│   ├── api/
│   │   └── waitlist/
│   │       └── route.ts     # POST waitlist endpoint (Zod, RLS, IP rate limit)
│   ├── layout.tsx           # Global root layout (Fonts, GA4/GTM script loader, Metadata)
│   ├── sitemap.ts           # Dynamic XML sitemap generator
│   └── robots.ts            # Dynamic robots.txt generator
├── components/
│   ├── ui/                  # Extended shadcn primitives (CVA customized variants)
│   ├── layout/              # Shared structure: Navbar, Footer
│   ├── marketing/
│   │   ├── sections/        # Homepage section components (Hero, Why, Curriculum, etc.)
│   │   └── product-mockup/  # Visual UI mockup mockups (SkillRadar, AIChat, cards)
│   └── forms/               # Form logic: WaitlistForm (3-field React Hook Form)
├── hooks/                   # Custom utility hooks (useScrolled, useReducedMotion)
├── lib/
│   ├── utils.ts             # Tailwind class merger (cn helper)
│   ├── analytics.ts         # Centralised GA4 event tracking wrappers
│   ├── supabase.ts          # Server & browser Supabase client factories
│   └── design/
│       └── tokens.ts        # Shared typed design constants (colors, margins)
├── styles/
│   └── globals.css          # Tailwind base, import, and custom @theme config
├── config/
│   ├── content.ts           # Single source of truth for marketing copy (Sprint 3)
│   └── navigation.ts        # Link definitions for headers and footers
├── types/
│   └── index.ts             # Global TypeScript type definitions
└── supabase/
    └── migrations/
        └── 001_waitlist.sql # Supabase waitlist SQL migration
```

---

## Design System Integration (Tailwind v4)

Design tokens defined in Sprint 1 are managed entirely inside `app/globals.css` in the `@theme` block.

```css
@theme inline {
  --font-sans:    var(--font-inter);
  --font-display: var(--font-fraunces);

  --color-background:        var(--color-background);
  --color-foreground:        var(--color-foreground);
  --color-primary:           var(--color-primary);
  --color-accent:            var(--color-accent);
  --color-skill-execution:   var(--color-skill-execution);
  /* ... etc. */
}
```

Components use semantic tailwind helper classes (`bg-background`, `text-primary`, `font-display`) and must never use hardcoded hex values.

### Dark Mode
CSS variables inside the `.dark` class block are defined in `globals.css` but dark-mode switching and QA are deferred to a future sprint.

---

## waitlist Integration

Waitlist registrations are verified client-side (Zod + React Hook Form) and sent to `POST /api/waitlist` containing:
- `name` (Full Name)
- `email` (Email address)
- `current_role` (Role dropdown select)
- `utm_*` (Source, medium, campaign) automatically captured client-side
- `referrer` header automatically parsed server-side

### Supabase Table Setup
Run the SQL migration in `supabase/migrations/001_waitlist.sql` using the Supabase SQL editor. It enables Row Level Security (RLS) to permit `anon` inserts while blocking all read actions.

---

## Google Analytics 4 Events

All events are wrapped inside `lib/analytics.ts`:
- `waitlist_signup` — Fired on successful waitlist submission.
- `hero_cta_click` — Fired on clicking CTA buttons (`location` param).
- `curriculum_view` — Fired when Curriculum section is visible.
- `portfolio_view` — Fired when Portfolio section is visible.
- `faq_expand` — Fired on expanding Accordion items (`question_index` param).
- `scroll_90_percent` — Fired on reaching 90% scroll depth.

---

## Setup & Running

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Setup Env Variables**:
   Copy `.env.example` to `.env.local` and fill in your Supabase tokens and GA4 credentials.

3. **Run Dev Server**:
   ```bash
   npm run dev
   ```

4. **Verify Build**:
   ```bash
   npm run build
   ```
