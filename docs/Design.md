# PM Academy — Design

**Status:** Living document — single source of truth for visual design, UX patterns, and the marketing website's content/SEO strategy.
**Platform:** Responsive web application — desktop-first experience with mobile responsiveness. Browser-based navigation (no native app patterns).
**Companion docs:** `PRD.md` (what/why), `Architecture.md` (technical implementation), `Rules.md` (working standards), `Phases.md` (when).
**Design system:** `Design-System-Sprint-1.md` is the Phase 0/Sprint 1 foundation for brand, tokens, responsive rules, component specifications, and frontend component architecture. Any UI implementation must follow that document before inventing new patterns.
**Marketing website:** `Marketing-Website-Sprint-2.md` is the Figma-ready public website specification for sitemap, IA, sections, responsive layouts, motion, component mapping, and developer handoff.
**Content system:** `Content-Communication-System-Sprint-3.md` is the authoritative voice, messaging, UX writing, email, notification, SEO, social, glossary, and developer copy guidance.

---

## 1. Design Direction

**Positioning to design against:** "The rigor of a b-school elective, the habit-forming feel of a language-learning app." The visual language sits between **Duolingo's playfulness** and **Linear/Notion's seriousness** — not full cartoon-mascot territory (undermines credibility), not sterile-corporate either (kills the habit loop).

| Element | Direction | Rationale |
|---|---|---|
| **Typography** | A serif or high-quality slab typeface for lesson headings; clean sans-serif for UI chrome and body text | Signals "this is a real course," not a generic SaaS landing page |
| **Color** | One confident, distinct primary brand color — avoid generic SaaS blue/purple gradients. Consider a deep amber/ochre or forest green that reads "academic" rather than "startup." Full semantic system layered on top for correct/incorrect/streak/locked states | A distinct primary color is a differentiation and memorability lever, not just aesthetics |
| **Motion** | Purposeful micro-interactions only: XP counter tick-up, streak flame pulse, skill radar animating on update. No gratuitous confetti-everything | Save celebration animations for genuinely big milestones (module complete, capstone submitted) so they retain meaning — overusing celebration animation cheapens it |
| **Iconography** | One consistent line-icon set for the 7 skill clusters, reused everywhere (skill radar, lesson tags, filters) | Builds fast pattern recognition across the product |

**Do not deviate from this direction without updating this section first** — a future contributor introducing, say, a purple gradient hero section would be working against the deliberate positioning choice made here.

---

## 2. Core Screens — Build/Design Order

Design (and build) in this order — each screen unlocks meaningful user testing before the next. All screens must be fully responsive (desktop + mobile) with desktop as the primary design target:

1. **Lesson reading view** — the single most-used screen in the product. Get this right before anything else. Content is rendered from pre-generated static JSON (see `Architecture.md` §4) — no runtime markdown parsing. Must render all content sections cleanly: theory prose, mental model diagram, case study, framework table.
2. **Quiz flow** — question → immediate feedback → explanation → next. Feedback states (correct/incorrect) are part of the semantic color system (§1).
3. **Dashboard** — progress ring, skill radar, streak, "continue where you left off." The skill radar must be the single most prominent element (per `PRD.md` §2's key IA decision) — do not let streak or XP visually dominate over it.
4. **Module/curriculum map** — visual, not a bare list. A game-world-map metaphor works well for 9 modules (locked/unlocked states, prerequisite paths visible).
5. **Flashcard review session** — card-flip interaction, SM-2-driven due-card queue.
6. **Onboarding** — placement-style intro quiz (sets initial skill-radar baseline) + goal-setting ("why are you here") that tailors notification cadence and dashboard copy per `PRD.md` §4.1.
7. **Authentication pages** — sign up, log in, password reset. Supports Email + Password and Google Login via Supabase Auth. Clean, minimal forms that reinforce the brand.
8. **Waitlist page** — pre-launch landing page collecting name, email, and current career position. Must go live in Week 1 independent of all other work (see `PRD.md` §8).
9. **Search experience** — client-side search powered by a build-time generated `search-index.json` (see `Architecture.md` §5). Fast, instant results as the user types. Should feel integrated into the curriculum navigation, not a separate "search page."

---

## 3. Gamification UI Specification

Translating `PRD.md` §4.6–§4.10 into concrete visual/interaction rules:

### 3.1 XP & Levels
- XP gains render as a small tick-up animation near the point of action (e.g., after a quiz question, after finishing a Theory read) — not a full-screen interruption.
- Level-up (title change) is a **genuinely big milestone** — this is one of the few moments that earns a fuller celebration animation (§1's "purposeful motion" rule). Show both the game-level number and the career title (e.g., "Level 4 — Senior PM") together, reinforcing the dual-purpose naming from `PRD.md` §4.6.

### 3.2 Streaks
- A streak flame icon with a subtle pulse animation when active; visually distinct (e.g., grayed out) when at risk of breaking.
- Streak-freeze availability shown clearly but modestly — never with urgency-manufacturing language ("Don't lose your streak!!") per the no-dark-patterns rule (`Rules.md` §2.6).

### 3.3 Skill Radar
- Rendered as a radar/spider chart with the 7 competency clusters as axes (`PRD.md` §3): Discovery & Research, Strategy, Design & UX, Execution & Delivery, Metrics & Growth, Leadership & Communication, Platform/Technical/Specialized.
- Animates smoothly when a value changes (after lesson/quiz/capstone completion) — this is one of the purposeful micro-interactions called out in §1.
- Must be legible and exportable as a standalone image/section for the portfolio export feature (`PRD.md` §4.11) — design it to look credible and clean enough to paste into a LinkedIn post or resume attachment, since that's an explicit acquisition lever.

### 3.4 Badges
- Displayed in a clean grid on the Progress screen; earned badges are in full color/detail, unearned ones shown as subtle silhouettes (motivates without nagging).
- Keep the total visual footprint modest — per the ~20-badge cap (`PRD.md` §4.9), this should never look like a sprawling achievement wall.

### 3.5 Leaderboard
- Framed around **consistency** (days studied this week), not raw XP — the UI copy and sort order must reflect this explicitly (e.g., show "4/7 days studied" prominently, not just a raw XP rank number).
- Opt-in toggle must be easy to find and easy to turn back off — this is a trust signal consistent with the no-dark-patterns principle.

### 3.6 Celebration Moments (use sparingly — this is the full list)
Reserve fuller celebratory animation/UI treatment for exactly these moments, and no others, so they retain meaning:
- Module completed
- Capstone submitted
- Level-up / title change
- Full curriculum completion ("Chief Product Officer")

All other XP/progress feedback should be small, quick, and non-disruptive.

---

## 4. Accessibility & Internationalization

- **WCAG AA minimum**, built in from day one, not retrofitted (`PRD.md` §5): sufficient color contrast (verify the chosen primary brand color, §1, against WCAG AA contrast ratios for text use), full keyboard navigation across lesson/quiz/dashboard flows, screen-reader labels on all interactive elements (quiz options, flashcard flip controls, streak/XP indicators).
- **i18n-ready from day one:** externalize all UI strings (`Rules.md` §3.1/§3.3 principle extends here) even though launch is English-only. Do not hardcode copy inline in components — this matters given the target audience skews global, including a significant India/APAC share given the positioning's b-school framing (`PRD.md` §1).

---

## 5. Design System Component Inventory (Figma + code)

Build these as the first design-system components (Phase 0, `Phases.md`), matching the shadcn/ui + Tailwind stack (`Architecture.md` §1):

- Typography scale (serif/slab for headings, sans-serif for body/UI — §1)
- Color tokens: primary brand color + full semantic set (success/correct, error/incorrect, streak-active, locked/disabled)
- Buttons (primary, secondary, disabled/locked states)
- Cards (lesson card, module card, badge card)
- Progress ring component
- Quiz option component (default / selected / correct / incorrect states)
- Radar/spider chart component (for skill radar)
- Streak flame indicator
- Skill-cluster icon set (7 icons, one per competency cluster)
- Search input with instant results dropdown
- Authentication form components (email/password inputs, social login buttons)
- Waitlist form component (name, email, career position fields)

---

## 6. Marketing Website — Content Structure & SEO Strategy

The marketing site is the **official information page for PM Academy** — it precedes the app (waitlist page live Week 1, per `Phases.md` Phase 0) and continues alongside it as the SEO-facing front door.

### 6.1 Site Structure

```
pmacademy.com (marketing site — see Architecture.md §3 for hosting/deployment decision)
├── / (Home)
│   ├── Hero: positioning line (PRD.md §1) + primary CTA (waitlist pre-launch, "Start Learning Free" post-launch)
│   ├── The gap section: fragmented free content vs. $200–$2,000 paid courses vs. PM Academy
│   ├── How it works: curriculum structure (9 modules, 90 lessons) + gamification teaser (skill radar, streaks)
│   ├── Sample lesson previews (linking to the 3–5 public lesson pages)
│   ├── "Free forever" explainer — directly reinforces Product Principle #2 (PRD.md §1) for skeptical visitors
│   └── Footer CTA + waitlist/signup form
├── /curriculum
│   └── Full 9-module, 90-lesson outline — public, indexable, itself an SEO asset (learners search for "product management curriculum")
├── /lessons/[slug] (3–5 public sample lesson pages pre-launch, all 90 lesson preview pages post-launch per PRD.md §5's SEO requirement)
│   └── Full lesson content, SSR, structured data (see §6.3)
├── /about
│   └── Founder story, why-free narrative — supports the LinkedIn/organic launch channel (PRD.md §8.2)
├── /waitlist (pre-launch only; redirects to /signup post-launch)
└── /blog (optional, post-launch — supports long-tail SEO beyond the 90 core lesson topics)
```

### 6.2 Page-by-Page Content Guidance

- **Home:** Lead with the positioning line and the "gap" narrative (`PRD.md` §1) — this is the core story that differentiates PM Academy and should be the first thing any visitor reads. Keep copy honest and specific (per Product Principle #3's "respect the learner's time" — no inflated claims).
- **Curriculum page:** Publish the full module/lesson outline publicly, even pre-launch. This is both a credibility signal ("here's actual depth, not vague promises") and a strong SEO asset, since module/lesson titles map closely to real search queries.
- **Sample lesson pages:** Publish 3–5 full lessons before full launch (per `PRD.md` §8's pre-launch requirement) — this gives an SEO head start and is more credible than landing-page copy alone ("here's actual sample content").
- **About page:** Founder-voice narrative about the free-vs-paid gap — this directly feeds the LinkedIn launch channel (`PRD.md` §8.2), where founder-voice posts about *why* the product was built are a primary distribution lever.
- **Waitlist page:** Minimal friction — collects **name, email, and current career position** only. Clear "90 lessons. Free forever." headline. This must be able to go live independent of all other engineering work (`Phases.md` Phase 0). Stored in Supabase `waitlist` table, confirmation email sent via Resend SMTP.

### 6.3 SEO Strategy

- **Primary keyword strategy:** the 90 lesson topics map almost 1:1 to real search queries — "what is a PRD," "jobs to be done framework," "product-led growth explained," "what is product management," etc. Public lesson pages targeting these terms are the largest organic channel by month 6–12, even though they contribute near-zero at launch week (`PRD.md` §8.2, §9). Treat this as a slow-compounding channel, not a launch-week tactic.
- **Technical SEO requirements** (mirrors `PRD.md` §5's non-functional requirement): SSR on all public lesson and curriculum pages, proper meta titles/descriptions per page, Article/Course structured data (schema.org) on lesson pages, clean semantic HTML (proper heading hierarchy, not div soup), fast Lighthouse performance (≥ 90 target).
- **Content-led SEO expansion (post-launch):** once the core 90 lesson pages are indexed and ranking, a `/blog` section can extend reach to adjacent long-tail queries career switchers search for (e.g., "how to break into product management without experience") — this is explicitly a post-launch, lower-priority addition, not a Phase 0–5 requirement.
- **Off-page/organic amplification:** the shareable skill-radar/portfolio export feature (`PRD.md` §4.11) is itself an SEO/backlink and referral-traffic lever once users start posting their progress publicly on LinkedIn — design the exported portfolio page to be genuinely shareable and well-attributed back to PM Academy (e.g., a visible "built with PM Academy" footer/watermark on public portfolio pages, done tastefully, not as a heavy-handed ad).

### 6.4 Marketing Site — Technical & Cost Notes

- The marketing pages are part of the main Next.js application, deployed on Vercel (`Architecture.md` §1). One domain, one deploy, shared design system.
- The waitlist form posts to a `waitlist` table in Supabase (see `Architecture.md` §2) — no separate email-marketing SaaS at launch scale; this can be reconsidered later without infra cost until volume genuinely demands a dedicated tool.
- Transactional emails (waitlist confirmation, email verification, password reset, welcome) sent via Resend connected to Supabase through SMTP.

---

## 7. Design Principles Recap (quick-reference)

1. Rigor of a b-school elective + habit of a language app — never fully cartoon, never sterile-corporate.
2. Skill radar is the visual hero of the product — protect its prominence on the dashboard against every other competing element.
3. Motion is purposeful and rare — save real celebration for genuinely big milestones (§3.6's exact list).
4. No dark patterns in UI copy or interaction design — urgency and scarcity language are never manufactured.
5. Accessibility and i18n-readiness are built in from day one, not retrofitted.
6. The marketing site tells the "gap" story first and proves it with real sample content, not just claims.

---

## Changelog

- v2.0 — Updated for responsive web app (desktop-first + mobile). Added authentication pages, waitlist page, and search experience to core screens. Updated waitlist to collect name/email/career position. Added search, auth, and waitlist components to design system. Removed Cloudflare Pages references. Updated marketing site to Vercel-only hosting with Resend SMTP for transactional email.
- v1.3 - Added `Content-Communication-System-Sprint-3.md` as the Sprint 3 content and communication system.
- v1.2 - Added `Marketing-Website-Sprint-2.md` as the Sprint 2 public website design specification.
- v1.1 — Added `Design-System-Sprint-1.md` as the authoritative Sprint 1 design foundation and component-system specification.
- v1.0 — Initial design document authored from the "PM Academy — 0→1 Roadmap & Project Plan" source document, expanding the UX/design-system section and formalizing the marketing website's content structure and SEO strategy.
