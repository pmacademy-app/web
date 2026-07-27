# PM Academy — Design System Sprint 1

**Status:** Authoritative Sprint 1 foundation. Use this before designing or building any page.
**Companion docs:** `Design.md`, `PRD.md`, `Architecture.md`, `Rules.md`, `Phases.md`.
**Intent:** Build a premium learning platform that feels free in cost, not cheap in care.

---

## 1. Brand Personality

PM Academy should feel like a world-class PM mentor packaged as a calm, beautiful product.

**Core traits**
- **Rigorous:** every screen should imply substance, structure, and professional credibility.
- **Encouraging:** the product motivates without nagging, shaming, or manufacturing urgency.
- **Playfully precise:** microcopy, motion, and progress feedback can have warmth, but the core interface stays crisp.
- **Future-facing:** the system should feel native to 2026: AI-aware, fast, personalized, and elegant.
- **Generous:** the free promise is a brand asset. Avoid anything that visually resembles a funnel trap.

**Emotional arc**
- **Curiosity:** first contact should reveal a clear path and a sense of possibility.
- **Excitement:** interactions should make progress feel alive.
- **Trust:** typography, spacing, and restraint should signal this is serious education.
- **Motivation:** progress should be visible, honest, and skill-based.
- **Achievement:** milestones should feel earned, not sprayed on every click.

**Voice**
- Direct, calm, intelligent, and specific.
- Prefer "You are building product judgment" over "Crush your PM dreams."
- Never use false scarcity, shame, fear, hype, or fake urgency.
- Use short action labels: "Start lesson", "Review cards", "Submit capstone", "Share portfolio".

---

## 2. Visual Identity

**Positioning:** the rigor of a b-school elective with the habit-forming clarity of a language-learning app.

**Visual references, translated rather than copied**
- Apple: calm hierarchy, beautiful restraint.
- Linear: density without clutter, confident surface discipline.
- Notion: readable knowledge workspace.
- Stripe: premium trust and polished gradients used sparingly.
- Vercel: speed, minimalism, engineering taste.
- Raycast: command-center clarity.
- Arc: subtle personality and refined color.
- Framer: motion as craft.
- Duolingo: habit loop and approachable feedback, without cartoon excess.

**Signature product motifs**
- **Skill radar:** the primary visual metaphor for competence.
- **Learning path:** module progression as a tasteful map, not a childish board game.
- **Portfolio artifacts:** capstones and reflections should look export-worthy from day one.
- **AI companion surfaces:** subtle, assistive, and low-friction; never visually louder than the lesson.

**Avoid**
- Generic blue-purple SaaS gradients as the dominant look.
- Mascot-first cartoon design.
- Dense enterprise dashboards.
- Decorative blobs, floating gradient orbs, excessive glassmorphism.
- Marketing-card layouts inside the product learning experience.

---

## 3. Design Philosophy

1. **Typography carries the product.** The primary luxury signal is readable, beautifully spaced learning content.
2. **Progress is competence, not completion.** Skill growth is more prominent than raw XP.
3. **Gamification serves learning.** Rewards appear after real effort: reading, quiz mastery, review, reflection, capstone work.
4. **Every component earns its surface.** Use borders, fills, shadows, and cards only when they clarify hierarchy.
5. **Motion is feedback, not decoration.** Animation explains state changes and celebrates rare milestones.
6. **Free must feel trustworthy.** No visual language that suggests hidden paywalls or bait-and-switch mechanics.
7. **Design for repeated daily use.** The app should feel calm on the 50th visit, not just impressive on the first.

Decision challenge: if a pattern could belong to any generic productivity SaaS, add PM Academy-specific meaning through progress, learning context, artifact quality, or skill-building language.

---

## 4. Color System

The palette should feel academic, modern, and memorable. Use warm ivory surfaces, ink text, botanical greens, energetic amber, and sharp semantic colors. Avoid making the UI one-note; no single hue should dominate every surface.

### 4.1 Core Palette

| Token | Light | Dark | Purpose |
|---|---:|---:|---|
| `background` | `#FBFAF6` | `#0E1110` | App base |
| `foreground` | `#171A17` | `#F4F1E8` | Primary text |
| `surface` | `#FFFFFF` | `#161A18` | Elevated panels, cards |
| `surface-muted` | `#F2EFE7` | `#202520` | Subtle bands, inactive areas |
| `border` | `#DED8CB` | `#343A34` | Default border |
| `border-strong` | `#BDB4A2` | `#4A5249` | Emphasis border |
| `primary` | `#1F6B4E` | `#66D6A3` | Main action, active learning |
| `primary-foreground` | `#FFFFFF` | `#07110C` | Text on primary |
| `accent` | `#D98B24` | `#FFB454` | XP, milestones, highlights |
| `accent-foreground` | `#211204` | `#1C1003` | Text on accent |
| `focus` | `#2F80ED` | `#7AB2FF` | Focus ring only |

### 4.2 Semantic Palette

| Token | Light | Dark | Usage |
|---|---:|---:|---|
| `success` | `#15803D` | `#4ADE80` | Correct answer, successful save |
| `success-bg` | `#EAF7EE` | `#13261A` | Success surface |
| `warning` | `#B45309` | `#FACC15` | At-risk streak, caution |
| `warning-bg` | `#FFF4D6` | `#30250B` | Warning surface |
| `danger` | `#C2410C` | `#FB7185` | Incorrect answer, destructive action |
| `danger-bg` | `#FFF0E8` | `#321A16` | Error surface |
| `info` | `#2563EB` | `#93C5FD` | Informational callouts |
| `info-bg` | `#EBF2FF` | `#13213A` | Info surface |
| `locked` | `#8A8174` | `#8A9289` | Locked modules, unavailable states |
| `ai` | `#7C3AED` | `#C4B5FD` | AI assistance accents only |

### 4.3 Competency Colors

These colors identify the seven PM skill clusters. Use them as small accents, chart strokes, tags, and icon color. Never fill large surfaces with all seven at once.

| Cluster | Token | Color |
|---|---|---:|
| Discovery & Research | `skill-discovery` | `#0F766E` |
| Strategy | `skill-strategy` | `#1D4ED8` |
| Design & UX | `skill-design` | `#DB2777` |
| Execution & Delivery | `skill-execution` | `#7C3AED` |
| Metrics & Growth | `skill-growth` | `#16A34A` |
| Leadership & Communication | `skill-leadership` | `#D97706` |
| Platform / Technical | `skill-technical` | `#475569` |

### 4.4 Usage Rules

- Use primary green for the main next action and active path states.
- Use amber for earned energy: XP, streaks, level-up, module completion.
- Use semantic colors only for semantic meaning.
- Body text must meet WCAG AA contrast.
- Do not put long text on amber, pink, or purple surfaces unless contrast has been verified.
- Gradients are allowed only for premium milestone moments, skill-radar export backgrounds, or subtle marketing surfaces.

---

## 5. Typography Scale

Use two type families:
- **Display / lesson headings:** a serious editorial serif or slab such as `Source Serif 4`, `Newsreader`, or `Fraunces`.
- **UI / body:** a clean sans such as `Inter`, `Geist`, or `Satoshi`.

If only one family is available at implementation start, use `Geist` for everything and preserve the scale.

| Token | Size | Line height | Weight | Use |
|---|---:|---:|---:|---|
| `display-xl` | 56 | 64 | 650 | Marketing hero only |
| `display-lg` | 44 | 52 | 650 | Major app moments, completion |
| `h1` | 36 | 44 | 650 | Page title |
| `h2` | 28 | 36 | 650 | Section title |
| `h3` | 22 | 30 | 650 | Card group title |
| `h4` | 18 | 26 | 650 | Component title |
| `body-lg` | 18 | 30 | 400 | Lesson prose |
| `body` | 16 | 26 | 400 | Default body |
| `body-sm` | 14 | 22 | 400 | Secondary text |
| `caption` | 12 | 18 | 500 | Metadata, labels |
| `micro` | 11 | 16 | 600 | Badges, compact UI |

**Rules**
- Letter spacing is `0`; do not use negative tracking.
- Lesson body max width: `68ch`.
- Dashboard/card text max width: contextual; avoid long lines inside compact panels.
- Use sentence case for UI labels.
- Do not use hero-scale type inside cards, sidebars, or dialogs.

---

## 6. Spacing System

Use a 4px base with semantic spacing aliases.

| Token | px | Use |
|---|---:|---|
| `space-1` | 4 | Tight icon gaps |
| `space-2` | 8 | Button icon gap, compact stack |
| `space-3` | 12 | Form gaps |
| `space-4` | 16 | Default component padding |
| `space-5` | 20 | Card internal spacing |
| `space-6` | 24 | Section grouping |
| `space-8` | 32 | Page section rhythm |
| `space-10` | 40 | Large component separation |
| `space-12` | 48 | Page block spacing |
| `space-16` | 64 | Major section spacing |
| `space-24` | 96 | Marketing section spacing |

**Rules**
- Learning pages need more vertical breathing room than dashboards.
- Repeated cards should use consistent internal padding: `16px` compact, `20px` default, `24px` feature.
- Form rows use `12px` vertical gaps; field groups use `24px`.
- Touch targets are at least `44px`.

---

## 7. Grid System

**Breakpoints**
- `xs`: 360
- `sm`: 640
- `md`: 768
- `lg`: 1024
- `xl`: 1280
- `2xl`: 1536

**Containers**
- Marketing content: max `1120px`.
- App shell: full width with constrained content regions.
- Lesson reading column: max `760px` plus optional right rail at `280px`.
- Dashboard main grid: 12 columns desktop, 6 tablet, 4 mobile.

**Layout rules**
- **⚠ Corrected in this revision:** this previously said "Mobile first," which contradicts `Design.md` §2's explicit "desktop as the primary design target." PM Academy's core work — reading dense lesson theory, taking 15-question quizzes, writing PRD-style capstones — is knowledge work closer to Notion or Coursera than a mobile game, and the target user (career switchers actively job-hunting) does this work overwhelmingly on a laptop. **Design desktop-first**: build the full desktop layout and interaction model first, then adapt down to a genuinely complete (not stripped-down) mobile experience for on-the-go review — flashcards, streak check-ins, quick quiz retakes — rather than mobile driving the base layout decisions.
- Avoid horizontal scrolling except intentional carousels, tables with affordance, or code blocks.
- Sidebar collapses below `lg`.
- Right rails collapse below `xl`.
- Preserve a visible next step above the fold on dashboard and lesson completion screens.

---

## 8. Border Radius Rules

PM Academy should feel refined, not bubbly.

| Token | px | Use |
|---|---:|---|
| `radius-xs` | 4 | Inputs inside dense controls |
| `radius-sm` | 6 | Buttons, badges |
| `radius-md` | 8 | Cards, tabs, popovers |
| `radius-lg` | 12 | Dialogs, feature cards |
| `radius-xl` | 16 | Rare milestone panels |
| `radius-full` | 999 | Avatars, pills, progress rings |

**Rules**
- Default card radius is `8px`.
- Use `12px+` only for elevated, emotional, or modal surfaces.
- Icon buttons are square with `6px` or `8px` radius.

---

## 9. Shadows

Use shadows sparingly. Premium comes from spacing and contrast first.

| Token | Value | Use |
|---|---|---|
| `shadow-xs` | `0 1px 2px rgba(23,26,23,.06)` | Subtle controls |
| `shadow-sm` | `0 4px 12px rgba(23,26,23,.08)` | Popovers, dropdowns |
| `shadow-md` | `0 12px 32px rgba(23,26,23,.12)` | Dialogs |
| `shadow-glow-primary` | `0 0 0 4px rgba(31,107,78,.14)` | Focus/active emphasis |
| `shadow-glow-accent` | `0 0 24px rgba(217,139,36,.22)` | Rare milestones |

Dark mode shadows must use borders and overlays more than black blur.

---

## 10. Icons

Use `lucide-react` as the default icon library.

**Rules**
- Stroke width: `1.75` default, `2` for small icons.
- Sizes: `16`, `18`, `20`, `24`, `32`.
- Always pair unfamiliar icon-only controls with tooltips.
- Use icon + text for primary actions.
- Use icon-only for repeated toolbar actions when meaning is established.

**Core icon assignments**
- Discovery: `Search`
- Strategy: `Map`
- Design & UX: `PenTool`
- Execution: `ListChecks`
- Metrics & Growth: `LineChart`
- Leadership: `MessagesSquare`
- Technical: `Code2`
- Locked: `Lock`
- XP: `Sparkles`
- Streak: `Flame`
- Portfolio: `BriefcaseBusiness`
- AI help: `WandSparkles`

---

## 11. Illustration Style

Illustration should support comprehension and motivation, not decorate empty space.

**Style**
- Clean editorial diagrams, product artifacts, map-like module paths, and skill visualizations.
- Slightly tactile shapes, thin strokes, muted fills, warm paper-like backgrounds.
- Use real UI artifacts where possible: PRD snippets, roadmap cards, metric charts, interview notes.

**Do not use**
- Generic 3D blobs.
- Cartoon mascots as primary brand carriers.
- Abstract SaaS humans pointing at charts.
- Large decorative illustrations in dense app workflows.

---

## 12. Motion Principles

Use Framer Motion for stateful UI and milestone transitions.

**Motion values**
- Fast feedback: `120ms`
- Standard transition: `180ms`
- Complex panel/dialog: `240ms`
- Milestone celebration: `450-700ms`
- Easing: `easeOut` for enter, `easeIn` for exit, spring only for progress/XP moments.

**Allowed motion**
- Button press scale: `0.98`.
- Card hover lift: `translateY(-2px)` with border emphasis.
- Progress bar fill animation.
- XP tick-up near source of action.
- Skill radar value morph after verified progress.
- Dialog fade/scale.
- Accordion height transition.

**Celebration moments only**
- Module completed.
- Capstone submitted.
- Level/title changed.
- Full curriculum completed.

Respect `prefers-reduced-motion`: replace movement with opacity or instant state changes.

---

## 13. Component Philosophy

Components should be primitives plus product-specific composites.

**Primitive layer**
Buttons, inputs, cards, badges, dialog, tabs, tooltip, toast, skeleton, avatar, pagination.

**Product layer**
Lesson card, module card, course card, progress bar, skill badge, XP indicator, streak indicator, AI callout, capstone card.

**Rules**
- Start with shadcn/ui primitives and wrap them with PM Academy variants.
- Keep component APIs semantic: `variant="primary"` is acceptable; `className="green-big"` is not.
- Product components receive product state, not raw styling instructions.
- Empty, loading, error, and success states are part of each workflow, not afterthoughts.

---

## 14. Dark Mode Strategy

Dark mode is a first-class learning environment, especially for evening study.

**Rules**
- Default to system preference with manual override.
- Dark mode is not pure black; use warm charcoal backgrounds.
- Maintain brand green and amber, but increase lightness for contrast.
- Reduce shadow reliance; use borders and surface contrast.
- Lesson prose must remain comfortable: avoid bright white walls of text.
- Charts require dark-mode-specific grid, label, and fill values.

---

## 15. Accessibility Guidelines

- WCAG AA minimum for all text and interactive states.
- Keyboard access for every control.
- Visible focus ring using `focus`.
- Inputs must have persistent labels, not placeholder-only labels.
- Icon-only buttons require `aria-label`.
- Toasts should use live regions, but avoid interrupting screen readers for low-priority updates.
- Quiz feedback cannot rely on color alone; include icons and text.
- Progress bars include `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, and readable labels.
- Dialogs trap focus and restore focus on close.
- Tooltips are supplemental only; critical information must be available without hover.
- Support reduced motion.
- Hit targets at least `44px` on touch devices.

---

## 16. Responsive Design Rules

**⚠ Corrected in this revision:** the mobile-first framing below is replaced with a desktop-primary, mobile-complete framing consistent with `Design.md` §2 and the layout-rules correction in §7 above. The bottom-nav pattern is kept — it's a legitimate, widely-used responsive-web convention (not exclusive to native apps; Notion, Linear, and X's web apps all use it at narrow viewports), but it must never expand beyond a thin tab strip into anything resembling a native app shell (no swipe-to-navigate between tabs, no pull-to-refresh, no native-style modals) — `Design.md` §2's "no native app patterns" rule governs *interaction model*, not this one navigational affordance.

- Build the full desktop experience first; adapt it down to mobile rather than starting from a mobile layout and stretching it up.
- On mobile, prioritize the tasks a learner actually does on a phone — flashcard review, checking streak/skill radar, retaking a missed quiz question — over trying to replicate the full desktop lesson-writing/capstone-authoring experience, which realistically happens on desktop.
- Mobile navigation uses a bottom nav bar for core areas: Home, Curriculum, Review, Progress, Profile. Keep it a simple tab strip — no native-app gesture patterns layered on top.
- Desktop uses sidebar for authenticated app routes.
- Reading view prioritizes text; secondary progress panels collapse into sheets/drawers.
- Tables become cards or horizontally scrollable regions with visible affordance.
- Dialogs become bottom sheets on small screens when task-oriented.
- Keep CTAs reachable without covering content.
- Never rely on hover to reveal essential actions.

---

# Component System

Every component below should be represented in Figma and implemented as a typed React component when engineering begins.

## Buttons

**Purpose:** trigger actions and route transitions.

**Variants:** `primary`, `secondary`, `outline`, `ghost`, `destructive`, `success`, `locked`, `ai`.

**States:** default, hover, active, focus, loading, disabled, locked.

**Sizes:** `sm` 32px, `md` 40px, `lg` 48px, `icon` 40px, `touch` 44px minimum.

**Behavior:** one primary action per section. Loading state preserves width and shows spinner.

**Interaction:** press scale `0.98`; hover border/fill shift; no layout shift.

**Motion:** 120ms color/transform.

**Accessibility:** native button, clear labels, `aria-busy` when loading.

**Tailwind guidance:** use CSS variables for colors; compose with shadcn `buttonVariants`; apply `focus-visible:ring-2 focus-visible:ring-focus`.

## Inputs

**Purpose:** capture user data with confidence and low friction.

**Variants:** text, email, password, textarea, select, search, OTP, inline editable.

**States:** default, hover, focus, filled, disabled, error, success.

**Sizes:** `sm` 36px, `md` 44px, `lg` 52px.

**Behavior:** labels persist above fields; helper/error text sits below.

**Interaction:** focus ring plus border emphasis.

**Motion:** 120ms border/ring.

**Accessibility:** associated label, described-by helper/error text, no placeholder-only inputs.

**Tailwind guidance:** `bg-surface border-border rounded-sm/md`; error uses semantic tokens.

## Cards

**Purpose:** group related content or represent selectable learning objects.

**Variants:** default, interactive, selected, locked, elevated, milestone.

**States:** default, hover, focus, active, disabled, loading.

**Sizes:** compact, default, feature.

**Behavior:** entire card can be clickable only when it has one dominant action.

**Interaction:** interactive cards lift `-2px` and strengthen border.

**Motion:** 180ms transform/shadow.

**Accessibility:** clickable cards use semantic link/button roles and visible focus.

**Tailwind guidance:** `rounded-md border bg-surface p-5`; avoid nested card structures.

## Badges

**Purpose:** label status, skill clusters, difficulty, and achievement.

**Variants:** neutral, skill, success, warning, danger, locked, XP, streak.

**States:** default, active, disabled.

**Sizes:** `xs`, `sm`, `md`.

**Behavior:** badges are metadata, not buttons, unless explicitly rendered as filter chips.

**Interaction:** filter chips toggle with selected state.

**Motion:** quick color transition.

**Accessibility:** selected chips expose `aria-pressed`.

**Tailwind guidance:** `rounded-sm px-2 py-0.5 text-micro`; skill variants map to competency colors.

## Navigation

**Purpose:** orient learners and keep core loops reachable.

**Variants:** desktop sidebar, mobile bottom nav, top breadcrumb, command/search nav.

**States:** active, hover, focus, collapsed, locked route.

**Sizes:** sidebar 256px expanded, 72px collapsed; mobile bottom 64px.

**Behavior:** authenticated app favors sidebar desktop and bottom nav mobile.

**Interaction:** active route has icon color, text weight, and subtle surface.

**Motion:** sidebar collapse 240ms; active indicator 180ms.

**Accessibility:** landmark `nav`, current route uses `aria-current="page"`.

**Tailwind guidance:** keep nav layout fixed; use route data to render items.

## Sidebar

**Purpose:** persistent desktop app navigation and learning progress context.

**Variants:** expanded, collapsed, lesson mode, admin/future.

**States:** active, hover, focus, locked, collapsed.

**Behavior:** includes product mark, primary routes, current streak/XP compact summary, settings.

**Interaction:** collapsed items show tooltips.

**Motion:** width transition without content jump.

**Accessibility:** keyboard navigable; collapse control has clear label.

**Tailwind guidance:** `hidden lg:flex`, `w-64`, border-right, sticky/full-height.

## Navbar

**Purpose:** top-level public marketing navigation and lightweight app header on mobile.

**Variants:** marketing, app mobile, lesson header.

**States:** transparent/top, scrolled, menu open.

**Behavior:** marketing navbar shows brand, curriculum, sample lessons, sign in, primary CTA.

**Interaction:** mobile opens sheet menu.

**Motion:** scrolled background fades in over 180ms.

**Accessibility:** menu button controls labelled sheet.

**Tailwind guidance:** sticky top, backdrop only when needed; avoid heavy glass effect.

## Footer

**Purpose:** trust, orientation, legal and public links.

**Variants:** marketing, app minimal, portfolio export.

**States:** normal only.

**Behavior:** include free-forever promise, curriculum links, about, privacy, contact.

**Interaction:** links have visible hover/focus.

**Motion:** none beyond link transitions.

**Accessibility:** semantic footer.

**Tailwind guidance:** full-width band, constrained inner grid, not a card.

## Progress Bar

**Purpose:** communicate completion, mastery, reading progress, and XP progression.

**Variants:** linear, circular/ring, segmented, skill-specific.

**States:** empty, partial, complete, locked, animated update.

**Sizes:** thin 4px, default 8px, large 12px, ring 64/96/128px.

**Behavior:** label the metric and denominator where possible.

**Interaction:** optional tooltip for details.

**Motion:** fill animates 300-500ms after verified progress.

**Accessibility:** ARIA progressbar with readable label.

**Tailwind guidance:** track uses `surface-muted`; fill uses primary/skill/accent tokens.

## Lesson Card

**Purpose:** represent one lesson in a module or recommended-next area.

**Variants:** next, available, completed, locked, review-needed.

**States:** hover, focus, active, loading.

**Sizes:** compact list, default card.

**Behavior:** shows lesson number, title, estimated time, tags, quiz status, completion.

**Interaction:** primary click opens lesson; locked state explains prerequisite.

**Motion:** hover lift; completion check animates in.

**Accessibility:** title is link text; locked explanation available to screen readers.

**Tailwind guidance:** use grid with fixed metadata column to prevent shifting.

## Module Card

**Purpose:** represent a module as a pacing unit.

**Variants:** current, unlocked, completed, locked, capstone-due.

**States:** hover, focus, selected, locked.

**Sizes:** map node, list card, dashboard feature.

**Behavior:** shows module name, progress, lesson count, competency emphasis, capstone status.

**Interaction:** locked modules reveal requirements; completed modules can view portfolio artifact.

**Motion:** map path and progress fill animate subtly.

**Accessibility:** expose locked/unlocked/completed state in label.

**Tailwind guidance:** avoid game-board excess; use tasteful path connector and skill accents.

## Course Card

**Purpose:** represent the whole PM Academy curriculum or future tracks.

**Variants:** full curriculum, sample/public, future track.

**States:** default, hover, active, coming soon.

**Sizes:** feature, compact.

**Behavior:** shows module count, lessons, estimated total effort, primary outcome.

**Interaction:** opens curriculum or starts first lesson.

**Motion:** hover border emphasis.

**Accessibility:** clear link title and metadata.

**Tailwind guidance:** use restrained feature card with one primary CTA.

## Feature Card

**Purpose:** explain product capabilities on marketing or onboarding surfaces.

**Variants:** learning, AI, portfolio, gamification, community.

**States:** default, hover optional.

**Sizes:** compact, default, wide.

**Behavior:** icon, title, one concise proof-oriented description.

**Interaction:** only clickable if it navigates somewhere meaningful.

**Motion:** minimal.

**Accessibility:** do not hide meaning in icon alone.

**Tailwind guidance:** no nested cards; use section grids with `gap-4/6`.

## Callout

**Purpose:** highlight learning insights, AI suggestions, study tips, and portfolio guidance.

**Variants:** note, insight, AI, warning, portfolio, example.

**States:** default, dismissible, expanded.

**Sizes:** inline, block.

**Behavior:** appears within lesson prose without breaking reading flow.

**Interaction:** dismissible only for nonessential hints.

**Motion:** fade/height for dismissal.

**Accessibility:** semantic region when important; icon plus text.

**Tailwind guidance:** left border or subtle tinted surface; avoid heavy cards inside prose.

## Alert

**Purpose:** communicate system or workflow status requiring attention.

**Variants:** info, success, warning, danger.

**States:** default, dismissible.

**Sizes:** compact, default.

**Behavior:** concise title plus action when useful.

**Interaction:** dismiss button has label.

**Motion:** enter/exit fade 180ms.

**Accessibility:** role `status` for neutral/success, `alert` for urgent errors.

**Tailwind guidance:** semantic background/border tokens.

## Accordion

**Purpose:** reveal structured details without overwhelming the learner.

**Variants:** default, lesson FAQ, settings, curriculum outline.

**States:** open, closed, disabled.

**Sizes:** compact, default.

**Behavior:** multiple-open by default for learning content; single-open where space is constrained.

**Interaction:** chevron rotates; header is full-width button.

**Motion:** height 180-240ms.

**Accessibility:** follow Radix/shadcn accordion semantics.

**Tailwind guidance:** use borders between rows, not boxed cards for each item.

## Tabs

**Purpose:** switch between peer content at the same hierarchy.

**Variants:** underline, segmented, vertical.

**States:** active, hover, focus, disabled.

**Sizes:** compact, default.

**Behavior:** use for lesson sections, dashboard views, portfolio tabs.

**Interaction:** active indicator slides.

**Motion:** 180ms indicator movement; content fade optional.

**Accessibility:** keyboard arrow navigation via Radix Tabs.

**Tailwind guidance:** segmented tabs for dense controls; underline tabs for page sections.

## Dialog

**Purpose:** focused decisions, confirmations, forms, and milestone reveals.

**Variants:** modal, confirmation, command, milestone.

**States:** open, closing, loading, error.

**Sizes:** sm 400px, md 560px, lg 720px, full mobile sheet.

**Behavior:** avoid dialogs for routine navigation.

**Interaction:** escape closes unless destructive operation is in progress.

**Motion:** overlay fade, content scale/slide 240ms.

**Accessibility:** focus trap, labelled title, described body, restore focus.

**Tailwind guidance:** shadcn Dialog with tokenized surface and radius-lg.

## Tooltip

**Purpose:** clarify icon-only actions or compact metrics.

**Variants:** default, metric, locked-reason.

**States:** hover, focus.

**Sizes:** short only.

**Behavior:** supplemental; never required for task completion.

**Interaction:** appears after short delay.

**Motion:** fade/slide 120ms.

**Accessibility:** keyboard focus triggers tooltip.

**Tailwind guidance:** use shadcn Tooltip; max width around 280px.

## Toast

**Purpose:** lightweight confirmation and recoverable errors.

**Variants:** success, info, warning, error, achievement.

**States:** entering, visible, exiting.

**Sizes:** default, compact.

**Behavior:** auto-dismiss for low-risk success; persist errors requiring action.

**Interaction:** optional undo/action.

**Motion:** slide/fade; reduced motion uses fade only.

**Accessibility:** live region with appropriate politeness.

**Tailwind guidance:** use semantic tokens; achievement toast may use accent glow sparingly.

## Skeleton

**Purpose:** show loading structure without layout shift.

**Variants:** text, card, avatar, chart, lesson prose.

**States:** loading only.

**Sizes:** match final component dimensions.

**Behavior:** never show skeleton for instant transitions under 300ms if avoidable.

**Interaction:** none.

**Motion:** subtle shimmer, disabled under reduced motion.

**Accessibility:** mark parent `aria-busy`; skeleton itself hidden from screen readers.

**Tailwind guidance:** `bg-surface-muted animate-pulse rounded-sm/md`.

## Avatar

**Purpose:** represent learner identity and community participants.

**Variants:** image, initials, generated color, anonymous.

**States:** online optional, selected.

**Sizes:** 24, 32, 40, 56, 80.

**Behavior:** fallback initials must be deterministic.

**Interaction:** profile menu trigger where applicable.

**Motion:** none except menu open.

**Accessibility:** decorative when adjacent name exists; labelled when standalone.

**Tailwind guidance:** use shadcn Avatar; deterministic background from user id.

## Breadcrumb

**Purpose:** orient users in curriculum hierarchy.

**Variants:** marketing, curriculum, lesson.

**States:** current, link, collapsed.

**Sizes:** default, compact.

**Behavior:** lesson breadcrumb: Curriculum / Module / Lesson.

**Interaction:** collapsed middle items open menu on mobile.

**Motion:** none.

**Accessibility:** `nav aria-label="Breadcrumb"` and `aria-current="page"`.

**Tailwind guidance:** use separators with lucide `ChevronRight`.

## Pagination

**Purpose:** navigate paged lists like glossary, leaderboard history, or portfolio artifacts.

**Variants:** numbered, simple previous/next, infinite-load trigger.

**States:** active, disabled, hover, focus.

**Sizes:** compact, default.

**Behavior:** lessons should prefer next/previous learning navigation, not generic pagination.

**Interaction:** stable button dimensions.

**Motion:** none.

**Accessibility:** labelled nav and current page.

**Tailwind guidance:** shadcn Pagination with tokenized focus.

## Search

**Purpose:** find lessons, glossary terms, flashcards, and settings.

**Variants:** inline, command palette, filter search.

**States:** empty, typing, results, no results, loading, error.

**Sizes:** default 44px, command 52px.

**Behavior:** command palette opens with keyboard shortcut later; search results group by Lessons, Glossary, Actions.

**Interaction:** keyboard-first navigation.

**Motion:** command dialog opens 180-240ms.

**Accessibility:** combobox/listbox semantics where applicable.

**Tailwind guidance:** input with leading `Search` icon; result rows fixed height.

## Empty States

**Purpose:** explain absence and guide next action.

**Variants:** no progress, no due cards, no search results, no portfolio artifacts, no cohort.

**States:** first-use, completed, filtered-empty.

**Sizes:** compact, full-panel.

**Behavior:** include one helpful action; avoid dead ends.

**Interaction:** primary CTA only when relevant.

**Motion:** optional gentle fade.

**Accessibility:** headings and clear copy.

**Tailwind guidance:** unframed centered content in panels; do not over-card.

## Loading States

**Purpose:** make waiting understandable and stable.

**Variants:** skeleton, spinner, progress, staged loading.

**States:** initial, refresh, mutation pending.

**Sizes:** match context.

**Behavior:** preserve layout; mutation loading should not blank the whole page.

**Interaction:** disable duplicate submissions.

**Motion:** reduced motion friendly.

**Accessibility:** `aria-busy`, status text for longer operations.

**Tailwind guidance:** prefer skeleton for page load, spinner for button/action.

## Error States

**Purpose:** help users recover without blame.

**Variants:** inline field error, card error, page error, network error, permission error.

**States:** recoverable, retrying, unrecoverable.

**Behavior:** explain what happened and what to do next.

**Interaction:** retry button where possible.

**Motion:** none beyond alert entrance.

**Accessibility:** errors connected to fields and announced when urgent.

**Tailwind guidance:** semantic danger tokens; avoid red-only meaning.

## Success States

**Purpose:** confirm completion and reinforce achievement.

**Variants:** save success, quiz correct, lesson complete, module complete, capstone submitted.

**States:** inline, toast, milestone.

**Behavior:** small successes are quiet; major learning milestones can be celebratory.

**Interaction:** provide next best action.

**Motion:** checkmark/progress fill for small; fuller celebration only for approved milestone list.

**Accessibility:** success text is explicit and not color-only.

**Tailwind guidance:** success tokens for correctness, accent tokens for achievement.

---

# System Implementation Guidance

## 17. UI Token System

Use CSS variables as the source of truth and map Tailwind theme keys to them.

**Token categories**
- Color: `--color-background`, `--color-primary`, `--color-skill-discovery`.
- Typography: `--font-sans`, `--font-display`, `--text-body`, `--leading-body`.
- Spacing: `--space-1` through `--space-24`.
- Radius: `--radius-xs` through `--radius-xl`.
- Shadow: `--shadow-xs` through `--shadow-md`.
- Motion: `--duration-fast`, `--duration-standard`, `--ease-out`.
- Z-index: `--z-nav`, `--z-popover`, `--z-dialog`, `--z-toast`.

**Rule:** raw hex values should live only in token definitions, not component files.

## 18. Naming Convention

**Design tokens**
- `category-role-state`, e.g. `color-button-primary-hover`.
- Prefer semantic role over visual color: `primary`, not `green`.

**Components**
- Primitives: `Button`, `Input`, `Card`, `Dialog`.
- Product components: `LessonCard`, `ModuleCard`, `SkillRadar`, `StreakIndicator`.
- State components: `EmptyState`, `ErrorState`, `LoadingState`, `SuccessState`.

**Variants**
- Use product meaning: `locked`, `completed`, `capstoneDue`, `reviewNeeded`.
- Avoid vague variants like `cool`, `fancy`, `modern`, `bigGreen`.

## 19. Folder Structure

Recommended within `apps/web`:

```txt
components/
  ui/                 # shadcn-wrapped primitives
  layout/             # navbar, sidebar, footer, app shell
  learning/           # lesson/module/course components
  progress/           # skill radar, XP, streaks, badges
  feedback/           # empty, loading, error, success states
  marketing/          # marketing-only sections
  motion/             # shared motion primitives
styles/
  globals.css
  tokens.css
  themes.css
  typography.css
lib/
  design/
    tokens.ts         # typed token references if needed
    component-variants.ts
```

## 20. Component Architecture

- Build on shadcn/ui and Radix primitives.
- Keep styling variants centralized with class variance authority or an equivalent pattern.
- Split smart and presentational pieces: data fetching stays in route/server layer; display components receive typed props.
- Product components should expose domain props, for example `status="locked"` or `progress={72}`, not arbitrary styling props.
- Do not couple business logic to visual components. XP, streak, and skill calculations belong in `lib/`.
- Every reusable component must define empty/loading/error behavior when it fetches or renders async data.
- Components should be theme-aware by default through CSS variables.

## 21. Reusable Design Rules

1. One primary action per screen region.
2. Skill radar outranks XP and streak in hierarchy.
3. Lesson reading comfort outranks decorative layout.
4. Cards are for objects, not for wrapping whole page sections.
5. Do not nest cards inside cards.
6. Use icons from lucide; do not draw one-off SVG icons unless the icon is brand-specific.
7. Every locked state explains how to unlock.
8. Every achievement state points to the next meaningful action.
9. Every chart must have a non-visual text summary.
10. Every public portfolio surface must look credible outside PM Academy.
11. Empty states should teach or guide, not apologize.
12. Motion must answer: what changed, where did it come from, or why does it matter?
13. Prefer durable restraint over trend-chasing.
14. If a component feels generic, anchor it in learning progress, PM artifacts, or competency development.

---

## Changelog

- v1.1 — Documentation review pass: fixed "Mobile first" layout rule (§7) and "Design mobile as a complete product" framing (§16), both of which contradicted `Design.md`'s explicit desktop-first, no-native-app-patterns principle. Reframed as desktop-primary, mobile-complete. Removed stray "AI panels" reference from §16 (orphaned — no such feature exists in `PRD.md`).
- v1.0 — Created Sprint 1 design foundation, token system, component specifications, and frontend architecture guidance for PM Academy.
