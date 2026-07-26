# PM Academy - Marketing Website Sprint 2

**Status:** Figma-ready website specification.
**Depends on:** `Design-System-Sprint-1.md`.
**Do not redesign:** Sprint 1 tokens, components, type scale, color system, motion principles, and accessibility rules remain the source of truth.
**Intent:** Design the public face of PM Academy: a premium, credible, free Product Management learning platform that moves visitors from curiosity to trust to excitement to waitlist signup.

---

## 1. Product Story

PM Academy exists because serious PM education is either expensive, fragmented, too theoretical, or too light to produce portfolio-worthy work. The website must make the visitor feel the contrast:

1. Product Management is learnable.
2. A serious path already exists here.
3. The product is free without feeling cheap.
4. Progress is measured by skill, not course completion vanity.
5. The output is a portfolio, not just a certificate.

**Primary message:** Learn Product Management. Build real products. Completely free.

**Secondary message:** A structured, AI-assisted PM curriculum with lessons, quizzes, projects, skill analytics, and portfolio artifacts.

**Emotional progression**
- Curiosity: the hero shows a beautiful product that appears deeper than a normal free course.
- Understanding: the problem section explains why PM education is broken.
- Trust: curriculum, competency model, and portfolio outputs prove substance.
- Excitement: learning experience, AI mentor, and community show daily momentum.
- Desire: final CTA makes joining feel like stepping into a serious free academy.

---

## 2. Sitemap

Sprint 2 designs the complete public website shell. The primary deliverable is the homepage, supported by navigation targets that can initially scroll to sections and later become standalone routes.

```txt
/
  #hero
  #why
  #journey
  #curriculum
  #experience
  #skill-radar
  #portfolio
  #ai-mentor
  #community
  #testimonials
  #faq
  #waitlist

/curriculum       Future detailed curriculum route
/lessons          Future public sample lesson index
/portfolio        Future portfolio showcase route
/about            Future founder/about route
/faq              Future FAQ route, may remain section at MVP
/waitlist         Dedicated waitlist route or section anchor
```

**Navigation labels**
- Logo: Home
- Curriculum: `#curriculum`
- Learning Experience: `#experience`
- Portfolio: `#portfolio`
- About: `#why` or future `/about`
- FAQ: `#faq`
- Join Waitlist: `#waitlist`

---

## 3. Information Architecture

The homepage is not a pile of SaaS sections. It is a guided proof sequence.

| Order | Section | Visitor question answered | Conversion role |
|---:|---|---|---|
| 1 | Navigation | Where am I and what can I inspect? | Orientation |
| 2 | Hero | What is this and why should I care now? | Curiosity and first CTA |
| 3 | Why PM Academy Exists | Why does this need to exist? | Problem clarity |
| 4 | Learning Journey | Can I see a path for someone like me? | Understanding |
| 5 | Curriculum Preview | Is this actually complete? | Trust |
| 6 | Learning Experience | What does studying feel like? | Excitement |
| 7 | Skill Radar | How will I know I am getting better? | Differentiation |
| 8 | Portfolio | What will I have to show for it? | Aspiration |
| 9 | AI Mentor | Will I get help when stuck? | Support |
| 10 | Community | Will I learn alone? | Belonging |
| 11 | Testimonials | Can I believe this? | Credibility |
| 12 | FAQ | What are the catches? | Objection handling |
| 13 | Final CTA | What should I do next? | Conversion |
| 14 | Footer | Where else can I go? | Closure and trust |

---

## 4. Figma Frame Plan

Create one Figma page named `Marketing Website - Sprint 2`.

**Frames**
- `Desktop / Home - 1440`
- `Tablet / Home - 768`
- `Mobile / Home - 390`
- `Components / Marketing Website`
- `Motion Notes`
- `Handoff Notes`

**Desktop frame**
- Width: `1440`
- Container: `1120`
- Columns: 12
- Gutter: 24
- Margins: 160

**Tablet frame**
- Width: `768`
- Container: fluid with 40px margins
- Columns: 6
- Gutter: 20

**Mobile frame**
- Width: `390`
- Container: fluid with 20px margins
- Columns: 4
- Gutter: 16

**Shared section rhythm**
- Desktop section padding: 96px top/bottom, hero 128px top and 96px bottom.
- Tablet section padding: 72px top/bottom.
- Mobile section padding: 56px top/bottom, hero 96px top and 56px bottom.

---

## 5. Component Mapping

Use Sprint 1 components and variants only unless noted.

| Website element | Sprint 1 component |
|---|---|
| Nav links | `Navigation`, `Navbar`, `Button` |
| Mobile menu | `Dialog` as sheet, `Navigation` |
| Primary CTA | `Button variant="primary" size="lg"` |
| Secondary CTA | `Button variant="outline" size="lg"` |
| Product mockup shells | `Card variant="elevated"` with custom mockup composition |
| Module previews | `ModuleCard` |
| Lesson previews | `LessonCard` |
| Feature blocks | `FeatureCard` |
| Skill labels | `Badge variant="skill"` |
| Progress visuals | `ProgressBar`, `SkillRadar` future product component |
| AI mentor panel | `Callout variant="ai"` plus mock chat surface |
| FAQ | `Accordion` |
| Signup form | `Input`, `Button`, `Alert`, `SuccessState`, `ErrorState` |
| Loading placeholders | `Skeleton` |
| Testimonials | `Card variant="default"` |
| Footer | `Footer` |

**New Figma-only composition allowed:** `ProductMockupCluster`.
This is not a new component style. It is a composition of cards, progress bars, badges, module cards, and chart visuals arranged as a hero/product proof object.

---

## 6. Global Page Design

**Background**
- Light mode: `background #FBFAF6`.
- Use full-width surface bands only where hierarchy needs a chapter break.
- Preferred rhythm: warm base, white elevated product panels, muted ivory bands.

**Typography**
- Hero headline: `display-xl`, display family.
- Section headings: `h1` or `h2`, display family.
- Supporting copy: `body-lg` or `body`.
- Metadata and labels: `caption` or `micro`.

**Color**
- Primary green drives CTAs and active progress.
- Amber is earned energy: XP, streaks, milestones.
- Competency colors appear in the skill radar and module tags.
- AI purple appears only in AI mentor surfaces.

**Surface discipline**
- Do not wrap every section in a card.
- Use cards for objects: modules, lessons, testimonials, product mockup panels.
- Do not nest cards inside cards. Use separators, rows, or surface bands inside large mockups.

---

## 7. Navigation

### Purpose
Create trust and fast orientation while keeping waitlist signup always available.

### Desktop Wireframe

```txt
[PM Academy logo]   Curriculum   Learning Experience   Portfolio   About   FAQ            [Join Waitlist]
```

### High-Fidelity Description
- Sticky top navigation with warm translucent surface after scroll.
- Logo combines a compact mark and `PM Academy` wordmark.
- Links are quiet, text-first, `body-sm`, medium weight.
- CTA uses primary button, `md` on desktop, `lg` on mobile menu.
- At rest on hero, nav may be nearly flat against the background. On scroll, add border-bottom and subtle backdrop.

### Responsive Behavior
- Desktop: horizontal nav.
- Tablet: keep main links if space allows; otherwise collapse secondary links into menu.
- Mobile: logo left, menu icon right, waitlist CTA inside sheet and optionally as bottom sticky CTA after hero.

### Motion
- Entry: fade down 180ms.
- Scroll: background and border fade in over 180ms.
- Link hover: text color primary, no underline jump.
- Mobile menu: sheet slides from top or right in 240ms.
- Reduced motion: instant open/close and color state changes only.

### Accessibility
- `nav aria-label="Main"`.
- Current section support later with `aria-current`.
- Menu button uses `aria-expanded` and `aria-controls`.
- CTA text must be explicit: `Join Waitlist`.

### Developer Handoff
- Component: `Navbar`.
- Height: 72 desktop, 64 mobile.
- Position: sticky top `z-nav`.
- Container: 1120 desktop.

---

## 8. Hero Section

### Purpose
Immediately establish the promise: serious PM learning, practical output, free forever. The hero should feel like opening a premium product, not reading a sales page.

### Desktop Wireframe

```txt
Left 5 cols                                  Right 7 cols
---------------------------------------------------------------
Badge: 90 lessons. Free forever.            ProductMockupCluster
H1: Learn Product Management.                - Skill radar preview
    Build real products.                     - Module progress card
    Completely free.                         - Lesson completion card
Copy                                         - AI hint chip
[Join Waitlist] [Explore curriculum]         
Trust line: No paywalls. No fluff.           
```

### High-Fidelity Description
- The H1 should be the strongest visual moment on the site.
- Use line breaks intentionally:
  - Learn Product Management.
  - Build real products.
  - Completely free.
- Supporting copy: "A structured, AI-assisted PM academy with interactive lessons, quizzes, capstones, skill analytics, and portfolio projects - built for career switchers and ambitious builders."
- Primary CTA: `Join Waitlist`.
- Secondary CTA: `Explore Curriculum`.
- Product mockup cluster shows three overlapping but non-nested surfaces:
  - Skill radar panel with 7 colored axes.
  - Current module panel: "Module 03 - Execution & Delivery", progress 42%.
  - Lesson card: "Writing a PRD people can actually use", 18 min, quiz ready.
  - Small XP/streak row, quiet and secondary.

### UX Rationale
This section teaches the product's differentiator visually before asking the visitor to believe copy. The free promise appears early, but the product mockup makes it feel valuable rather than charitable.

### Responsive Behavior
- Desktop: two-column composition.
- Tablet: headline full width, mockup below in a 6-column cluster.
- Mobile: H1 first, copy, CTAs stacked, then simplified mockup with skill radar and one progress card only.

### Motion
- Entry: badge fades in, headline rises 12px, mockup panels stagger in 80ms apart.
- Hover: mockup cards lift 2px and highlight border.
- Micro interaction: radar line gently draws on load; progress bar fills from 0 to shown value.
- Scroll effect: mockup cluster translates slower than text by a small amount, max 16px.
- Loading: skeleton blocks matching mockup panels.
- Reduced motion: static final state, no parallax or draw animation.

### Accessibility
- H1 is one semantic `h1`.
- Product mockup is decorative unless rendered with meaningful text; if meaningful, provide text summary: "Preview shows skill radar, 42 percent module progress, and next lesson."
- Buttons have clear focus states.

### Developer Handoff
- Section id: `hero`.
- Components: `Button`, `Badge`, `Card`, `ProgressBar`, `SkillRadar`, `LessonCard`, `ModuleCard`.
- Padding desktop: top 128, bottom 96.
- Grid: 12 columns, 5/7 split.
- Max copy width: 560px.

---

## 9. Why PM Academy Exists

### Purpose
Explain the gap in current PM education through a story, not a generic pain-point grid.

### Desktop Wireframe

```txt
Centered section heading
"PM education should not require $2,000 and blind trust."

Narrative timeline / comparison band:
[Fragmented free content] -> [Expensive certificates] -> [PM Academy]
Scattered, no feedback       Costly, theoretical        Structured, practical, free
```

### High-Fidelity Description
- Use an editorial section with strong typography and restrained comparison cards.
- Start with a short narrative:
  "Most learners start with tabs: a blog post here, a YouTube playlist there, a framework thread saved for later. What they need is not more content. They need sequence, practice, feedback, and proof of skill."
- Follow with three horizontal comparison panels:
  - Fragmented free content: no sequence, no accountability, no portfolio.
  - Traditional courses: expensive, often passive, certificate-heavy.
  - PM Academy: structured roadmap, AI-assisted practice, portfolio artifacts, free core.
- PM Academy panel uses primary border and a small `Badge`: "Free forever".

### UX Rationale
The visitor should feel understood, not sold to. This builds trust by naming the real frustration without exaggerating competitors.

### Responsive Behavior
- Desktop: 3-column comparison after narrative.
- Tablet: 3 cards in a horizontal scroll or 2+1 grid.
- Mobile: stacked story cards with PM Academy last and visually stronger.

### Motion
- Entry: narrative fades in, cards appear left-to-right.
- Hover: cards reveal one proof point, no flip effects.
- Scroll: none.
- Loading: no special loading.
- Reduced motion: static.

### Accessibility
- Avoid color-only comparison.
- Use headings for each model.
- Ensure reading order matches story order.

### Developer Handoff
- Components: `FeatureCard`, `Badge`, `Callout`.
- Section background: `surface-muted`.
- Padding desktop: 96.
- Use `h2` heading and `body-lg` narrative.

---

## 10. The Learning Journey

### Purpose
Show learners that PM Academy has a coherent progression from beginner to career-ready.

### Journey Stages
1. Beginner
2. Foundation
3. Execution
4. Strategy
5. Leadership
6. Career Ready

### Desktop Wireframe

```txt
Heading + short copy

[Beginner]---[Foundation]---[Execution]---[Strategy]---[Leadership]---[Career Ready]
    Module hints, skills, artifact milestones shown below each stage
```

### High-Fidelity Description
- Use a refined roadmap, not a childish game board.
- Each stage is a milestone node on a gently curved path.
- Beneath nodes, show examples:
  - Beginner: PM vocabulary, product thinking.
  - Foundation: discovery, users, problem framing.
  - Execution: PRDs, prioritization, shipping.
  - Strategy: markets, positioning, business models.
  - Leadership: alignment, influence, tradeoffs.
  - Career Ready: portfolio, interview practice, capstones.
- Use competency colors as small node accents.

### UX Rationale
The section converts "this seems interesting" into "I can see myself moving through this."

### Responsive Behavior
- Desktop: horizontal roadmap.
- Tablet: two-row roadmap.
- Mobile: vertical timeline with sticky-ish progress line.

### Motion
- Entry: path line draws, nodes fade in sequentially.
- Hover: node expands a small detail row.
- Micro interaction: current sample stage pulses once on entry.
- Scroll: active node can highlight based on viewport.
- Loading: static skeleton path optional.
- Reduced motion: all nodes visible, no line draw.

### Accessibility
- Timeline uses ordered list semantics.
- Each node has text label and description.
- Do not rely on curved path visually for understanding.

### Developer Handoff
- Components: `ProgressBar` custom segmented variant, `Badge`, `FeatureCard`.
- Desktop grid: 12 cols; roadmap spans full container.
- Mobile: convert to ordered vertical list.

---

## 11. Curriculum Preview

### Purpose
Prove depth by showing all 9 modules with enough detail to feel real.

### Module Card Content
Each card includes:
- Module number and title.
- 10 lessons.
- Estimated time.
- 2-3 skill badges.
- Completion preview/progress visualization.
- One representative portfolio or learning outcome.

### Proposed 9 Modules
Use these as Figma placeholders until final content names are locked:

| Module | Title | Skills | Estimated time | Outcome |
|---:|---|---|---|---|
| 01 | Product Thinking Foundations | Strategy, Leadership | 4-5 hrs | Product judgment basics |
| 02 | Users, Problems & Discovery | Discovery, Design | 5-6 hrs | Research notes and opportunity brief |
| 03 | Defining Products & PRDs | Execution, Communication | 5-6 hrs | PRD draft |
| 04 | Prioritization & Roadmaps | Strategy, Execution | 4-5 hrs | Roadmap and tradeoff memo |
| 05 | Design, UX & Prototyping | Design, Discovery | 5-6 hrs | Wireframe critique |
| 06 | Metrics, Growth & Experiments | Growth, Technical | 5-6 hrs | Metrics tree and experiment plan |
| 07 | Technical Fluency for PMs | Technical, Execution | 4-5 hrs | API/platform decision brief |
| 08 | Stakeholders & Leadership | Leadership, Communication | 4-5 hrs | Alignment plan |
| 09 | Capstone & Career Portfolio | Strategy, Leadership | 6-8 hrs | Interview-ready case study |

### Desktop Wireframe

```txt
Heading + "90 lessons across 9 modules"

Module grid:
[01] [02] [03]
[04] [05] [06]
[07] [08] [09]
```

### High-Fidelity Description
- Use `ModuleCard` with consistent card height.
- Cards are premium and scannable: module number, title, tags, progress preview, outcome.
- Avoid making all cards identical in color. Use small skill accents, not full-color cards.
- Include a small curriculum summary panel: "90 lessons, 9 capstones, 7 competencies, 1 portfolio."

### UX Rationale
This section is a trust anchor. It answers the skeptical question: "Is this actually complete?"

### Responsive Behavior
- Desktop: 3-column grid.
- Tablet: 2-column grid plus summary row.
- Mobile: single-column list with compact module cards.

### Motion
- Entry: cards rise in staggered rows.
- Hover: border changes to primary and progress line animates slightly.
- Micro interaction: module number badge fills on hover.
- Scroll: no parallax.
- Loading: `Skeleton` card grid.
- Reduced motion: static cards.

### Accessibility
- Cards use links with clear module names.
- Skill badges include readable text.
- Estimated time and lesson count are text, not icon-only.

### Developer Handoff
- Components: `ModuleCard`, `Badge`, `ProgressBar`.
- Gap: 16 desktop, 14 tablet, 12 mobile.
- Card padding: 20.
- Keep card min height stable.

---

## 12. Learning Experience

### Purpose
Show what studying inside PM Academy feels like: active, structured, beautiful, and practical.

### Content Pillars
- Interactive lessons.
- AI Mentor.
- Flashcards.
- Quizzes.
- Assignments.
- Case studies.
- Portfolio projects.

### Desktop Wireframe

```txt
Left: section heading + feature list
Right: tabbed product screenshot area

Tabs: Lesson | Quiz | Flashcards | Assignment | Case Study
```

### High-Fidelity Description
- Use an underline or segmented `Tabs` component.
- The screenshot area is a product mockup, not a generic illustration.
- Lesson tab: prose layout with callout and "Continue to quiz" CTA.
- Quiz tab: question, options, immediate feedback.
- Flashcards tab: card flip surface and due count.
- Assignment tab: capstone prompt with portfolio toggle.
- Case Study tab: framework table and product example.

### UX Rationale
The visitor should understand that this is not passive content. Every learning mode has a job.

### Responsive Behavior
- Desktop: 5/7 split.
- Tablet: heading top, tabs below.
- Mobile: tabs become horizontal scroll; mockup simplified to one panel at a time.

### Motion
- Entry: feature list fades, active mockup appears.
- Hover: feature rows highlight matching mockup detail.
- Micro interaction: tab transition fade/slide 180ms.
- Scroll: none.
- Loading: screenshot panel skeleton.
- Reduced motion: instant tab changes.

### Accessibility
- Use real tab semantics.
- Mockup content should have readable text or be marked decorative with summary.
- Quiz examples must not use color alone for correct/incorrect.

### Developer Handoff
- Components: `Tabs`, `FeatureCard`, `LessonCard`, `Callout`, `Button`, `ProgressBar`.
- Section background: default or white surface band.
- Keep screenshot aspect ratio around 4:3 desktop and 1:1 mobile.

---

## 13. Skill Radar

### Purpose
Introduce PM Academy's competency model and show why it is better than simple course completion.

### Desktop Wireframe

```txt
Left: SkillRadar large
Right:
  Heading: Know what kind of PM you are becoming.
  Copy
  7 competency legend
  Analytics mini-cards
```

### High-Fidelity Description
- The radar is the visual hero of this section.
- Show 7 axes with competency colors.
- Include a before/after ghost shape to imply progression.
- Analytics cards:
  - Discovery: Intermediate -> Advanced
  - Strategy: 62%
  - Execution: 8 lessons completed
  - Recommended next: Metrics fundamentals
- Explain: "Course completion tells you what you consumed. Skill radar shows what you can actually do."

### UX Rationale
This is the strongest PM Academy differentiator. It reframes learning as skill development.

### Responsive Behavior
- Desktop: radar left 6 cols, content right 6 cols.
- Tablet: radar top, legend grid below.
- Mobile: simplified radar with legend below; analytics as horizontal cards.

### Motion
- Entry: radar grid fades, polygon draws/morphs.
- Hover: legend item highlights related axis.
- Micro interaction: analytics cards count up once.
- Scroll: no continuous animation after initial reveal.
- Loading: chart skeleton.
- Reduced motion: static radar final state.

### Accessibility
- Include a text summary of radar values.
- Legend labels are text and color.
- Chart is not the only carrier of meaning.

### Developer Handoff
- Components: `SkillRadar`, `Badge`, `ProgressBar`, `Card`.
- Competency colors must use Sprint 1 `skill-*` tokens.
- Ensure chart labels meet contrast.

---

## 14. Portfolio

### Purpose
Show the tangible output students build. This section should feel aspirational and career-relevant.

### Outputs
- PRDs.
- Roadmaps.
- Wireframes.
- Strategy docs.
- Case studies.
- Interview-ready portfolio.

### Desktop Wireframe

```txt
Heading centered
Subcopy

Large portfolio preview
Left rail: artifact list
Main: case study / PRD preview
Right: shareable profile summary
```

### High-Fidelity Description
- Treat portfolio artifacts like beautiful professional documents.
- Show a mock public profile: learner name, level/title, skill radar thumbnail, capstone artifacts.
- Artifact cards:
  - PRD: "Improving onboarding activation"
  - Roadmap: "Q3 Growth bets"
  - Case study: "Reducing checkout drop-off"
  - Strategy doc: "Market entry memo"
- CTA: "See what students build" or "Join the waitlist".

### UX Rationale
This section turns free learning into career value. It supports the "portfolio, not just certificate" product principle.

### Responsive Behavior
- Desktop: wide product preview with three internal zones.
- Tablet: preview becomes two stacked panels.
- Mobile: artifact cards first, then profile summary.

### Motion
- Entry: document preview slides up, artifact list staggers.
- Hover: artifact card reveals "Portfolio-ready" badge.
- Micro interaction: share link button shows success toast in prototype.
- Scroll: subtle document layer movement max 12px.
- Loading: document skeleton.
- Reduced motion: no parallax.

### Accessibility
- Portfolio preview must have text equivalents.
- Share button labels clearly communicate action.
- Avoid low-contrast document mock text.

### Developer Handoff
- Components: `Card`, `Badge`, `Avatar`, `Button`, `Toast`, `SkillRadar`.
- Use `surface` panels and `border`; avoid heavy shadows.
- Public portfolio routes later must be SEO-friendly and accessible.

---

## 15. AI Mentor

### Purpose
Present AI as a thoughtful mentor that helps learners think, practice, and improve. Do not oversell it as magic.

### Demonstrated Uses
- Ask questions.
- Review PRDs.
- Generate quizzes.
- Interview practice.
- Learning recommendations.

### Desktop Wireframe

```txt
Left: AI mentor chat/product panel
Right: heading, copy, capability list
```

### High-Fidelity Description
- Use `Callout variant="ai"` and a restrained chat-like panel.
- Example exchange:
  - Learner: "Can you review my PRD problem statement?"
  - Mentor: "Your target user is clear. The pain point needs sharper evidence. Try adding one behavioral signal..."
- Capability list uses icons and concise proof statements.
- Include boundary copy: "Guidance when you are stuck. The curriculum stays structured."

### UX Rationale
AI should increase trust, not make the platform feel like generated content. The message is mentorship and feedback, not automation replacing learning.

### Responsive Behavior
- Desktop: 6/6 split.
- Tablet: text first, panel second.
- Mobile: panel simplified to 2-3 chat bubbles and capability chips.

### Motion
- Entry: chat bubbles appear sequentially.
- Hover: capability row highlights.
- Micro interaction: typing dots for prototype only.
- Scroll: none.
- Loading: AI panel skeleton.
- Reduced motion: chat appears fully rendered.

### Accessibility
- Chat mockup can be an ordered transcript.
- AI purple is accent only; maintain contrast.
- Do not animate typing indefinitely.

### Developer Handoff
- Components: `Callout variant="ai"`, `Card`, `Badge`, `Button`.
- Token: use Sprint 1 `ai` sparingly.
- Avoid implying AI-generated curriculum unless product scope changes.

---

## 16. Community

### Purpose
Show that PM Academy can become a learning network without promising full social features before they ship.

### Elements
- Discussion.
- Study groups.
- Peer reviews.
- Leaderboards.
- Mentors.
- Future cohorts.

### High-Fidelity Description
- Use honest framing: "Learn beside other builders" and "Community features will open gradually."
- Show a cohort card with weekly consistency, peer review prompt, and mentor office-hours placeholder.
- Leaderboard example ranks consistency, not raw XP.
- Include opt-in trust note: "Leaderboards are opt-in and cohort-based."

### UX Rationale
The section creates belonging while respecting documented scope. It avoids overpromising forums or global social features.

### Responsive Behavior
- Desktop: 3-column feature grid plus one cohort preview.
- Tablet: 2-column.
- Mobile: stacked feature rows and compact cohort preview.

### Motion
- Entry: feature cards fade in.
- Hover: cohort rows highlight.
- Micro interaction: leaderboard row hover reveals "4/7 days studied".
- Loading: skeleton list.
- Reduced motion: static.

### Accessibility
- Do not use rank color alone.
- Clearly label opt-in behavior.
- Avoid social pressure copy.

### Developer Handoff
- Components: `FeatureCard`, `Card`, `Avatar`, `Badge`, `ProgressBar`.
- Copy must not promise shipped features as available if they are future.

---

## 17. Testimonials

### Purpose
Create credibility without fake hype. Sprint 2 uses placeholders until real beta quotes exist.

### High-Fidelity Description
- Section title: "Built for learners who want proof of skill."
- Use 3 testimonial cards marked clearly as placeholders in Figma, not in production copy.
- Placeholder categories:
  - Career switcher.
  - Founder/operator learning PM.
  - Student/explorer.
- Copy tone should be specific, restrained, and outcome-oriented.

### Example Placeholder Copy
- "The roadmap made PM feel less mysterious. I knew exactly what to study next."
- "The capstone prompts pushed me to create work I could actually discuss in interviews."
- "The skill radar made my gaps visible without making me feel behind."

### UX Rationale
Credibility should come from specificity. Avoid "best platform ever" claims.

### Responsive Behavior
- Desktop: 3 cards.
- Tablet: 2 + 1.
- Mobile: carousel or stacked cards.

### Motion
- Entry: cards fade up.
- Hover: very subtle border emphasis.
- Loading: skeleton cards if fetched dynamically later.
- Reduced motion: static.

### Accessibility
- Use blockquote semantics when real quotes exist.
- Do not auto-rotate carousel on mobile.

### Developer Handoff
- Components: `Card`, `Avatar`, `Badge`.
- Replace placeholders before public launch.
- Keep testimonial card heights consistent.

---

## 18. FAQ

### Purpose
Remove friction and address skepticism, especially around "free".

### Questions
1. Is PM Academy really free?
2. Who is PM Academy for?
3. Do I need prior product experience?
4. How long does the curriculum take?
5. What will I build?
6. How does the AI Mentor work?
7. Will I get a certificate?
8. Is there a community?
9. When will PM Academy launch?
10. Will lessons ever be paywalled?

### High-Fidelity Description
- Use `Accordion`.
- Keep answers concise and specific.
- The free answer must be explicit: "The core curriculum is free. No paywalled lesson 11. No fake trial."
- Pair FAQ with a small trust panel: "90 lessons. 9 modules. Free core. Portfolio output."

### UX Rationale
FAQ is the trust lock. It should answer the skeptical visitor before the final CTA.

### Responsive Behavior
- Desktop: 8-column accordion plus 4-column trust panel.
- Tablet/mobile: stacked, accordion first.

### Motion
- Entry: section fade.
- Accordion: height transition 180-240ms.
- Hover: row background subtle.
- Loading: not needed unless FAQ is CMS-driven later.
- Reduced motion: instant expand/collapse.

### Accessibility
- Use proper accordion semantics.
- Keyboard navigation required.
- Answers remain readable with screen readers.

### Developer Handoff
- Components: `Accordion`, `Card`, `Badge`.
- Section id: `faq`.

---

## 19. Final CTA

### Purpose
Convert motivated visitors after they understand the full system.

### Desktop Wireframe

```txt
Large editorial CTA:
"Start building product judgment before you pay for another course."
Copy
[Email input] [Join Waitlist]
Small trust line
```

### High-Fidelity Description
- Full-width band using `surface-muted` or a restrained gradient derived from primary/accent tokens.
- Do not use a card as the entire CTA if the section itself can be a band.
- Include email capture with label.
- Success state: "You are on the waitlist. We will send the first preview lessons when they open."
- Error state: helpful and plain.

### UX Rationale
The CTA reframes joining as a practical next step, not a hype conversion.

### Responsive Behavior
- Desktop: heading and form side by side or centered max 760px.
- Tablet: centered.
- Mobile: stacked input and button, full width.

### Motion
- Entry: heading fade up, form fade.
- Hover: button standard primary behavior.
- Micro interaction: success toast and inline success state.
- Loading: button spinner preserves width.
- Reduced motion: static.

### Accessibility
- Email input has visible label.
- Errors are associated with input.
- Success is announced politely.

### Developer Handoff
- Components: `Input`, `Button`, `Toast`, `SuccessState`, `ErrorState`.
- Section id: `waitlist`.
- Supabase waitlist table integration later.

---

## 20. Footer

### Purpose
Provide closure, trust, and useful routes.

### Desktop Structure

```txt
Brand + free promise
Resources: Curriculum, Sample Lessons, Glossary
Product: Learning Experience, Skill Radar, Portfolio, AI Mentor
Company: About, Contact, Updates
Legal: Privacy, Terms
Social: LinkedIn, X, GitHub/Product Hunt future
```

### High-Fidelity Description
- Quiet, text-heavy footer.
- Include one sentence: "A free PM academy for people building real product judgment."
- No oversized CTA here; final CTA already did that job.

### Responsive Behavior
- Desktop: 5-column footer.
- Tablet: 3-column.
- Mobile: stacked accordions or simple groups.

### Motion
- Link hover only.
- No entry animation needed.

### Accessibility
- Semantic footer.
- Links have visible focus.

### Developer Handoff
- Component: `Footer`.
- Padding desktop: 64 top/bottom.
- Border top using `border`.

---

## 21. Complete Desktop Wireframe

```txt
Sticky Navbar

Hero
  Left: badge, H1, copy, CTAs, trust line
  Right: product mockup cluster

Why PM Academy Exists
  Editorial story
  Three-way comparison

The Learning Journey
  Six-stage roadmap

Curriculum Preview
  Summary stats
  9 module cards

Learning Experience
  Feature list
  Tabbed product mockup

Skill Radar
  Large radar
  Competency legend and analytics

Portfolio
  Artifact preview
  Public profile preview

AI Mentor
  Chat/product panel
  Capability list

Community
  Feature grid
  Cohort preview

Testimonials
  Three credibility cards

FAQ
  Accordion
  Trust summary

Final CTA
  Email waitlist form

Footer
```

---

## 22. Tablet Layout Rules

- Keep the same story order.
- Reduce side-by-side layouts into top/bottom blocks when either column would fall below 320px.
- Use 6-column grid.
- Hero mockup sits below text and spans full width.
- Curriculum uses 2-column cards.
- Skill radar appears above analytics.
- Portfolio preview becomes stacked.
- Navigation may collapse if link widths become cramped.

---

## 23. Mobile Layout Rules

- Navigation: logo + menu. Waitlist CTA appears in menu and after hero.
- Hero: text first, CTAs stacked, simplified product mockup.
- Comparison: story cards stacked.
- Journey: vertical timeline.
- Curriculum: single-column module list, optional "View all modules" reveal if page becomes too long.
- Learning experience: horizontally scrollable tabs with one mockup at a time.
- Skill radar: chart then text summary.
- Portfolio: artifact cards first, then profile preview.
- AI Mentor: transcript-like chat panel.
- FAQ: full-width accordion.
- Final CTA: full-width input and button.
- Avoid sticky bottom CTA if it covers content or creates fatigue; use only after visitor scrolls past hero.

---

## 24. Motion System Summary

| Section | Entry | Hover | Micro interaction | Scroll | Loading | Reduced motion |
|---|---|---|---|---|---|---|
| Nav | Fade down | Link color | Menu open | Sticky surface | None | Instant |
| Hero | Stagger text/mockups | Card lift | Radar draw, progress fill | Subtle mockup parallax | Mockup skeleton | Static |
| Why | Fade cards | Reveal proof | None | None | None | Static |
| Journey | Path draw | Node detail | Active node | Viewport highlight | Skeleton path | Static |
| Curriculum | Stagger grid | Border/progress | Module badge fill | None | Card skeletons | Static |
| Experience | Fade split | Feature highlight | Tab transition | None | Panel skeleton | Instant tabs |
| Skill Radar | Chart draw | Axis highlight | Count-up | None | Chart skeleton | Static |
| Portfolio | Slide document | Artifact badge | Share success | Subtle layer movement | Document skeleton | Static |
| AI Mentor | Chat sequence | Row highlight | Typing dots prototype | None | Panel skeleton | Static transcript |
| Community | Fade grid | Row highlight | Consistency reveal | None | List skeleton | Static |
| Testimonials | Fade up | Border | None | None | Card skeletons | Static |
| FAQ | Fade | Row bg | Accordion | None | None | Instant |
| CTA | Fade | Button | Success state | None | Button spinner | Static |
| Footer | None | Link color | None | None | None | Static |

---

## 25. Waitlist Form States

**Default**
- Label: `Email address`
- Placeholder: `you@example.com`
- Button: `Join Waitlist`

**Loading**
- Button shows spinner and `Joining...`
- Input remains visible but disabled.

**Success**
- Inline success state below form.
- Optional toast: "You are on the waitlist."
- Do not clear the whole CTA section.

**Error**
- Field-level error for invalid email.
- System error: "Something went wrong. Try again in a moment."
- Keep user input intact.

**Accessibility**
- Use `aria-invalid` for field errors.
- Use `aria-describedby` for helper and error text.
- Announce success with polite live region.

---

## 26. Content Guidelines

**Headlines should be concrete**
- Good: "Know what kind of PM you are becoming."
- Weak: "Powerful analytics for modern learners."

**Copy should prove the product**
- Use numbers: 90 lessons, 9 modules, 7 competencies.
- Use artifacts: PRDs, roadmaps, case studies.
- Use learning actions: quiz, review, reflect, submit, share.

**Avoid**
- "Unlock your potential."
- "10x your career."
- "AI-powered revolution."
- "Limited spots."
- "Don't miss out."

---

## 27. Accessibility Checklist

- One H1.
- Logical heading hierarchy.
- All links and buttons are keyboard reachable.
- Visible focus rings.
- CTA form labels are persistent.
- Mockups either contain readable text or have text summaries.
- Chart has text alternative.
- Testimonials use real attribution only when real.
- FAQ uses accessible accordion semantics.
- No motion required to understand content.
- Color contrast verified for text on all surfaces.
- Mobile tap targets at least 44px.

---

## 28. Developer Implementation Notes

- Build as a Next.js route under `(marketing)` in `apps/web` unless the waitlist needs to ship independently first.
- Use server-rendered marketing content for SEO.
- Use semantic HTML sections with ids matching navigation anchors.
- Keep the page performant: avoid heavy animation libraries beyond Framer Motion already chosen.
- Defer non-critical mockup animations until after first paint.
- Use CSS variables from Sprint 1 for all colors.
- Do not introduce new one-off Tailwind colors in section files.
- Use image assets only when they show product reality or meaningful artifacts. Product mockups can be built in HTML/CSS for crispness.
- Use PostHog events later for:
  - `waitlist_cta_clicked`
  - `curriculum_section_viewed`
  - `portfolio_section_viewed`
  - `waitlist_submitted`
- Do not track sensitive form input values.

---

## 29. Figma Layer Naming

Use stable names so design and engineering can discuss the same objects.

```txt
Home/Desktop
  01_Nav
  02_Hero
    Hero_Copy
    Hero_CTA_Group
    ProductMockupCluster
  03_Why
  04_Journey
  05_Curriculum
  06_Experience
  07_SkillRadar
  08_Portfolio
  09_AIMentor
  10_Community
  11_Testimonials
  12_FAQ
  13_FinalCTA
  14_Footer
```

Component instances should use Sprint 1 names: `Button/Primary/Lg`, `ModuleCard/Unlocked`, `Badge/Skill`, `Accordion/Default`.

---

## 30. Design Review Criteria

Before approving the Figma design, challenge every section:

1. Does this build trust?
2. Does this teach something about the PM Academy method?
3. Does this create excitement without hype?
4. Does this motivate waitlist signup?
5. Does this reflect Sprint 1 tokens and components?
6. Could this section belong to any generic SaaS website? If yes, add PM Academy-specific proof: curriculum depth, skill radar, portfolio artifacts, or learning behavior.
7. Does this respect the free promise without making the product look cheap?
8. Is the section still clear on mobile?
9. Is the motion meaningful if removed?
10. Is accessibility designed in rather than patched later?

---

## Changelog

- v1.0 - Created Figma-ready Sprint 2 marketing website specification for the complete PM Academy public website.
