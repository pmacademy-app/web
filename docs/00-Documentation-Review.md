# PM Academy — Documentation Review
### Principal Product Architect / Founding Engineer critique — PRD, Architecture, Design, Rules, Phases, and the three Sprint specs

**Scope reviewed:** `PRD.md`, `Architecture.md`, `Design.md`, `Rules.md`, `Phases.md`, `02-PM-Academy-0-to-1-Roadmap.md`, and the three sprint docs (`Design-System-Sprint-1.md`, `Marketing-Website-Sprint-2.md`, `Content-Communication-System-Sprint-3.md`).

**Overall verdict:** This is a genuinely strong, unusually thorough documentation set — better than what most pre-seed products have at this stage. The core four docs (PRD/Architecture/Design/Phases) are internally consistent with each other on the big calls: static-first architecture, $0-infra-cost discipline, RLS-everywhere security, free-forever product ethos, responsive-web-not-native platform. The problems are concentrated in the **sprint docs drifting from the canonical docs** — classic living-document decay, where downstream specs were written from an earlier version of the vision and never fully reconciled after the canonical docs were updated. I found and fixed the concrete instances (see the accompanying updated files); this document explains the reasoning and flags what still needs your decision.

---

## 1. Critical findings (launch-blocking if unresolved)

### 1.1 The marketing site was selling a feature that doesn't exist
`Marketing-Website-Sprint-2.md` §15 and large parts of `Content-Communication-System-Sprint-3.md` build a full homepage section, hero copy line, FAQ answer, footer nav link, SEO meta descriptions/OG tags, and even a chat **error state** ("The AI Mentor is unavailable right now") around an LLM-backed "AI Mentor" that reviews PRDs, generates quizzes, and gives interview practice.

This capability is **absent from `PRD.md`'s feature list (§4), `Architecture.md`'s stack and data model, and `Phases.md`'s roadmap** — and it directly contradicts `PRD.md` §6's own stated non-goal: *"AI-generated personalized lesson content... curriculum is fixed and human-authored."* It also quietly breaks your $0-infra-cost architecture principle (`Architecture.md` §1, `Rules.md` §2.3) — metered LLM API calls have no meaningful free tier at real usage volume, unlike everything else in this stack (Vercel, Supabase, Resend all have genuinely usable free tiers at MVP scale).

This is the single most severe issue in the doc set, for a simple reason: **it's a promise your engineering plan has no way to keep.** If this ships to a public marketing site as written, you either scramble to build an unplanned, unbudgeted LLM feature under launch pressure, or you publish a hero section, FAQ answer, and SEO description for a feature that silently never appears — which is worse for trust than never having promised it, especially for a product whose entire pitch is "free forever, no dark patterns, no fake anything."

**What I did:** Added a formal Open Decision to `PRD.md` §11 laying out both real options (cut entirely from v1, or make it a real Phase 7+ budgeted feature). Fixed the highest-stakes instances directly (hero copy, SEO/OG/Twitter meta, FAQ, homepage value prop, footer nav, IA table, wireframes) across both sprint docs. Flagged the remaining lower-stakes instances (~15 in the content doc) with an exact document-wide notice for whoever does the final copy pass before launch.

**My recommendation:** Cut it from v1 entirely. You already have a good pattern for this in `PRD.md` §10 — monetization is explicitly deferred until the free core is proven. Treat AI Mentor the same way, and for the same reason: it's a real cost center that should only be built once you know it's worth funding, not baked into launch-week marketing copy.

### 1.2 Waitlist form field mismatch
`PRD.md` §8 and `Architecture.md`'s `waitlist` table (`name`, `email`, `career_position`, all `NOT NULL`) require three fields. Both `Marketing-Website-Sprint-2.md` §25 and `Content-Communication-System-Sprint-3.md` §9 specified an **email-only** form. Built as originally written, the form would either need last-minute rework or would violate the database schema's `NOT NULL` constraints the moment someone tried to wire it up.

This is exactly the kind of gap that's invisible until a developer is mid-implementation and discovers two "authoritative" docs disagree — worth catching now, for free, rather than during a sprint.

**What I did:** Fixed both sprint docs to the canonical 3-field spec.

### 1.3 Mobile-first vs. desktop-first — a real, substantive contradiction, not just wording
`Design.md` §2 is explicit: *"desktop-first experience... desktop as the primary design target... no native app patterns."* `Design-System-Sprint-1.md` said *"Mobile first"* as a hard layout rule and *"Design mobile as a complete product, not a collapsed desktop,"* paired with a bottom tab-bar nav — the single most recognizable native-app UI convention (iOS Human Interface Guidelines and Android Material Design both use it as their canonical primary-navigation pattern).

This matters beyond wording because **your actual product doesn't support a mobile-first design philosophy.** Look at what the curriculum actually asks of a learner: reading dense theory sections, taking 15-question quizzes with explanations, writing PRD-style capstone assignments, reviewing a skill radar across 7 competencies. This is knowledge work — closer to Notion, Coursera, or Linear than to a mobile game or social app. Your own target user (a career switcher actively job-hunting, per `PRD.md` §2) does this kind of deep work on a laptop, not a phone, the overwhelming majority of the time. A "mobile-first" design philosophy for this specific product would optimize the base layout for the 20% of usage (quick review sessions, streak check-ins) at the expense of the 80% (actual learning, writing, deep reading) — backwards.

**What I did:** Rewrote both the layout rule and the responsive design rules section to be desktop-primary, mobile-complete — explicitly keeping the bottom-nav pattern (it's a legitimate, common responsive-web convention now, not native-exclusive — Notion, Linear, and X's web apps all use it at narrow viewports) but reframed around what a learner actually does on each device, and added an explicit boundary: bottom nav stays a simple tab strip, never grows native-app gesture patterns (swipe-to-navigate, pull-to-refresh) on top.

I also found and removed a stray reference to "AI panels" collapsing into mobile sheets in that same section — an orphaned mention of the non-existent AI Mentor feature that had leaked into unrelated layout guidance, evidence of exactly the kind of drift this whole review is about.

---

## 2. High-priority gaps

### 2.1 Missing public route for portfolio export
`PRD.md` §4.11 requires a portfolio/capstone showcase page that renders for a **logged-out visitor** — the whole point is a recruiter can click a LinkedIn link and see the work without an account. `Architecture.md`'s folder structure only defined `(marketing)`, `(auth)`, and `(app)` route groups — all either public-marketing or fully-authenticated. There was no route group for authenticated-user-generated-but-publicly-viewable content.

**What I did:** Added a `(portfolio)` route group to `Architecture.md`'s folder structure with an explicit note on the RLS/query-layer implication (serve only rows with `is_public = true`, enforced at the query layer, not route-level auth).

### 2.2 The "9 vs. 10 modules" decision was still marked Open while already decided by implementation
Every downstream document — `Architecture.md`, `Design.md`, `Phases.md`, both sprint docs — already builds on 9 modules × 10 lessons = 90. Leaving this "Open" in `PRD.md` §11 invited someone to reopen a decision that had, in practice, already been made everywhere except the decision log itself.

**What I did:** Formally closed it as Resolved: 9 modules, with a note on why (matches the actual content structure from the underlying curriculum, and every doc already assumes it).

### 2.3 Community section over-promises relative to what's actually planned
`Marketing-Website-Sprint-2.md` §16 markets "Discussion, Study groups, Peer reviews, Mentors, Future cohorts" — the copy does self-label these as future/aspirational rather than shipped, which is better practice than the AI Mentor section showed, but none of these appear anywhere in `Phases.md`'s post-launch phases either. This is lower severity than 1.1 because the copy is honest about timing, but it's still marketing a roadmap that doesn't exist in your actual roadmap doc. **Recommendation:** either add a lightweight "Community (future)" placeholder to `Phases.md`'s post-launch section so the claim has a real home, or soften the marketing copy further to avoid implying specific features (peer reviews, mentors) that aren't even loosely planned.

---

## 3. Architecture review — what's right, what's a real risk

**What's right, specifically:**
- The static-first content pipeline (Markdown → build-time JSON → CDN) is the correct call for 90 fixed, human-authored lessons. It keeps the product genuinely free to run at real usage volume, which is your core differentiator — don't let anyone talk you into a database-backed CMS "for flexibility" later; you don't need the flexibility and you'd be trading away the thing that makes the free-forever promise sustainable.
- RLS-everywhere on user-state tables, service-role key never touching the client — correctly specified.
- Choosing Email+Password/Google Login over building your own auth, and Resend over a custom SMTP setup — right calls, don't reinvent either.
- Client-side search over a hosted search service — appropriate at 90-lesson scale; revisit only if content volume grows an order of magnitude.

**Real risks worth flagging:**
- **The theory-read anti-gaming XP mechanism** (scroll-depth + dwell-time tracking to prevent "mark as read and skip" per the roadmap's original design) implies periodic heartbeat calls from the client to a server endpoint while a lesson is open. This is a legitimate design — don't remove it — but it's in tension with the static-first, low-cost architecture philosophy elsewhere in the doc, since it's the one piece of the reading experience that *can't* be purely static. Worth an explicit note in `Architecture.md`'s API design section on rate-limiting/debouncing this specific endpoint (e.g., one heartbeat per 30s, not continuous), so it doesn't become the one place Supabase's free-tier request quota gets tested at scale.
- **No GDPR/privacy consent flow mentioned anywhere**, despite `Architecture.md`'s i18n-readiness and the roadmap's explicit acknowledgment of a likely global (including EU/India) audience. Google Analytics without a consent mechanism is a real compliance gap for an EU-visible site. This needs one paragraph in `Architecture.md` (a cookie-consent banner gating GA initialization) before launch, not after.
- **Content parser tooling**: `Architecture.md` currently specifies a from-scratch custom Markdown parser rather than pointing to any existing library. Given your lesson format is highly structured (fixed section headers, markdown tables for quiz/glossary/flashcards) rather than prose-only blog content, a from-scratch regex/AST-walking parser is actually the *right* call here — general-purpose tools like Contentlayer (now unmaintained — see §5.3) or Velite (still early-stage, blog-oriented) aren't built for extracting structured tables out of Markdown the way your content needs. Keep the custom parser, but build it on top of `remark` + `remark-gfm` (for robust table parsing) and `gray-matter` (if you add frontmatter) rather than hand-rolled regex — regex-based Markdown table extraction is fragile against minor formatting drift across 90 files authored over time.

---

## 4. Web vs. mobile UX — what should actually be redesigned

You asked specifically whether the web-app UX carries over mobile-first assumptions that don't fit a web-first product. Beyond the bottom-nav/desktop-first fix above, here's a concrete, opinionated list of what genuinely differs between "good mobile app UX" and "good web UX" for this specific product — most of which the docs don't currently address either way:

| Surface | Mobile-app instinct (avoid) | Web-appropriate design (recommend) |
|---|---|---|
| **Quiz answer selection** | Tap-only targets | Add keyboard shortcuts (1–4 to select an option, Enter to advance) — desktop power users doing 1,350 quiz questions across the curriculum will feel the difference immediately. Not in any current doc. |
| **Flashcard review** | Swipe left/right to grade recall | Space to flip, number keys (1–4) or arrow keys to rate difficulty. Swipe gestures don't exist on desktop trackpads/mice in a discoverable way; don't design the interaction model around them. |
| **Global navigation/search** | Hamburger menu, in-app search bar | A `Cmd+K` command palette (already common in tools your target audience uses daily — Linear, Notion, Superhuman) for jumping to any lesson, module, or setting instantly. Genuinely well-suited to a keyboard-and-mouse desktop audience; absent from all current docs. |
| **Onboarding placement quiz** | Full-screen, one-question-per-swipeable-screen carousel | A denser single- or two-screen form. Desktop has the width; don't force a mobile carousel pattern onto a wide viewport — it reads as slow and app-like rather than efficient. |
| **Re-engagement / streak reminders** | Native push notifications | **Already correctly handled** — the docs rely on email (Resend) as the primary channel, which is exactly right for a browser-based product where push notifications require service-worker/PWA complexity and have unreliable opt-in rates. Call this out explicitly as a deliberate web-native decision, not an oversight, so nobody "fixes" it into a PWA push system later. |
| **Multi-tab workflows** | N/A (single app context) | Desktop users will very plausibly have the lesson open in one tab and a note-taking app or their own PRD draft open in another. No specific work needed here, but it's worth designing the capstone-writing flow (autosave, no aggressive "are you sure you want to leave" modals) with this real usage pattern in mind rather than a single-focus mobile-app assumption. |
| **Lesson reading layout** | Single-column, full-width | **Already correctly handled** — the 760px reading column + 280px right rail is a genuinely web-native, non-mobile-carryover pattern (the width you'd never get on a phone). Good existing decision, no change needed. |

---

## 5. Additional consistency, scalability, and documentation gaps

### 5.1 Rules.md's own change-management rule wasn't being followed by the sprint docs
`Rules.md` §7 (as referenced by the sprint docs' own "Depends on" headers) implies documents should update together when a canonical decision changes. The AI Mentor and waitlist-field drift are exactly what that rule exists to prevent, and it wasn't being enforced — there's no CI/lint check or review checklist actually verifying sprint docs stay in sync with the four canonical docs. **Recommendation:** add a lightweight "last verified against PRD/Architecture v[X]" line to the top of each sprint doc (I added changelog entries as a start; consider making this a standing practice) so drift is caught faster next time.

### 5.2 No explicit scalability ceiling documented for the client-side search approach
Client-side search is right for 90 lessons, but there's no stated threshold at which this doc set says "revisit this." Worth adding one sentence to `Architecture.md`: something like "revisit if lesson count exceeds ~300 or the search index exceeds ~2MB gzipped" — gives a future maintainer a concrete trigger instead of having to rediscover the tradeoff from scratch.

### 5.3 Contentlayer risk avoided, but worth naming explicitly
Not currently referenced anywhere in your docs (good), but since it's the single most commonly recommended tool for "Markdown content in Next.js" in older tutorials and AI training data, it's worth a one-line explicit note in `Architecture.md`: **do not use Contentlayer** — it's been effectively unmaintained since mid-2024 (the maintainer stopped merging PRs). This preempts a future contributor (human or AI-assisted) from "helpfully" introducing it.

---

## 6. What's already excellent — don't second-guess these under review pressure

- The $0-infra-cost discipline running through `Architecture.md` and `Rules.md` is rare in early-stage docs and is exactly right for a "free forever" product — it's the actual mechanism that makes the promise credible rather than aspirational.
- RLS-first security posture, documented per-table, is genuinely production-grade thinking at this stage.
- The skill-radar-over-completion-percentage framing in `PRD.md`/`Design.md` is a real differentiator and is consistently threaded through the design and content docs — good discipline.
- `Phases.md`'s ordering (free core proven before any monetization exploration) is a coherent, values-consistent sequencing decision, and it gave me the exact template I used to resolve the AI Mentor question the same way.
- The desktop reading-column + right-rail layout, and the email-first re-engagement strategy, are both genuinely web-native decisions already, not mobile carryovers — worth recognizing as evidence the team got the mobile→web transition right in at least two important places, even where the sprint docs elsewhere didn't fully catch up.
