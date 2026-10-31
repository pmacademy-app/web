# Prodily — UI/UX Audit

**Date:** 2026-10-17
**Commit:** `d43e3f2` (origin/main, "Merge pull request #57 … admin-guard-and-rpc-grants")
**Auditor topic:** UI / UX (visual design, IA, key flows, states, forms, mobile, accessibility, motion, copy)

All paths are relative to the repo root (`C:\Users\BIT\Desktop\prodily wev\web`). The app lives in `apps/web`.

---

## 1. Scope and method

**What I read (code):**
- Design foundation: `apps/web/app/globals.css` (all 907 lines), `apps/web/theme/tokens.ts`, `apps/web/lib/brand.ts`, `apps/web/components/ui/*` (button, input, card, dialog), `docs/DESIGN_SYSTEM.md`, `apps/web/components/marketing/styles.ts`.
- Shells and navigation: root layout, `(marketing)`, `(app)`, `(auth)` and onboarding layouts; `components/layout/{navbar,footer,AppShell,Sidebar,Topbar,MobileTabBar}.tsx`; `config/navigation.ts`; `proxy.ts` (redirect logic only).
- Flows: signup, login, `/verified`, the auth callback redirect targets (`app/api/auth/callback/route.ts`, `lib/auth-url.ts`), onboarding (page, wizard, actions), dashboard page and all of its cards, academy list, lesson page and `lesson-content.tsx` (all 1,089 lines), block renderer and blocks (SectionBlock, DefaultMarkdown, QuizBlock, InlineConceptCheck, MarkdownRenderer), review hub (Flashcard, QualitySelector, ReviewHub), capstone workspace (submit and autosave paths), settings (tabs, Danger Zone, portfolio form toggle, destructive confirm), public portfolio `/p/[username]`, certificate `/verify/[certificateId]`, public sample lesson `/lessons/[slug]`, app and root error/not-found/loading states.
- Homepage: page composition, hero, hero CTA, which marketing sections are client vs server, and which are dead code.
- Admin console: skimmed the folder structure and the scoped `.admin-console` token block only.

**Measurements I ran (read-only):**
- WCAG 2.x contrast ratios for the token palette and for the hard-coded Tailwind colours the app actually uses. I wrote a small Node script in my scratchpad (sRGB plus OKLCH-to-sRGB conversion, alpha blending for `/10`-style tints). Results are in §5 (UX-04).
- Grep counts of token usage vs. raw Tailwind/shadcn classes per folder, sub-12px text, `dark:` classes, modal implementations, primitive adoption.
- Module order and lesson titles from the compiled `content/dist/curriculum.json`.

**Live checks:** `https://prodily.app` does not resolve (DNS failure; the coordinator confirmed this). I fetched the live site at `https://prodily.adityagangwani.me` (`/`, `/signup`, `/login`, `/curriculum`, `/lessons/lesson-001`) with read-only GETs.

**What I could not verify:** I have no screenshots, ran no browser or dev server, and executed no client JavaScript. Statements about rendered behaviour that depend on the CSS cascade, stickiness, or event timing are marked **(inference)** and should be confirmed in a browser. I did not read every one of the ~319 components. Leaderboard, badges, notifications, search and the quick-start tour were skimmed, not read in full.

---

## 2. Scorecard

| Sub-area | Score (0–10) | One-line reason |
|---|---|---|
| Visual consistency | 4 | The marketing site has a real, documented system. The learner app uses none of it: 0 brand tokens in `components/settings`, `components/dashboard` (1), `blocks`, `components/leaderboard`. |
| Navigation / IA | 5 | Shells are solid and mobile has a tab bar, but module names differ across 4 sources, lesson numbering mixes local and global, and some pages are orphans. |
| Onboarding & activation | 6 | Onboarding is down to one good screen. Around it: signup/login server-render as "Loading…", there is a `/verified` detour, the return path is lost, and one redirect fails silently. |
| Lesson experience | 5 | Structure, gating and lock states are thoughtful. Reading width is far too wide, there are 12+ callout hues, the theory gate is opaque, and the quiz breaks keyboard use. |
| Dashboard | 5 | Heavy widgets are streamed well. But there is no h1, three "next step" signals compete, much small low-contrast text, and copy contradicts itself. |
| Forms & states | 5 | Good: RHF + zod, inline errors wired to inputs, typed destructive confirms, dirty-form guard. Bad: no autocomplete, iOS zoom, silent failures, `alert()`, unlabeled controls. |
| Mobile | 6 | Good: 44px marketing targets, safe-area tab bar, constrained notification drawer. Bad: hidden-scroll settings strip, 337 uses of 9–11px text, 32px buttons. |
| Accessibility | 4 | The marketing navbar is exemplary. The app has keyboard hijack in the quiz, widespread contrast failures, non-modal drawers and modals, and missing h1s. The a11y test gate only covers unused primitives. |
| Motion / perf feel | 6 | Marketing motion is CSS-only and respects reduced motion. In the app, the framer flip ignores reduced motion, there are bounce icons and a perpetual avatar spinner, and the sidebar shifts on hydration. |
| Copy | 6 | Marketing copy is sharp. App copy mixes in internal jargon ("AST Verified", "cascades… across all tables") and contradictory numbers (XP, "~5 mins" vs 25 min). |
| **Overall** | **5.2** | A polished marketing front door that leads into a learner app that looks, reads and behaves like a different product. |

---

## 3. Executive summary

1. **The app shows the founder's photo as other people's avatar.** Any learner without a name, and every learner whose name contains "aditya" and who has no avatar, sees `/avatars/aditya.png` as their own avatar in the header (`Topbar.tsx:232-236`). Fix it today.
2. **The quiz breaks keyboard and screen-reader use.** A window-level keydown handler swallows Enter and Space everywhere while a quiz is on screen, so Tab + Enter cannot select an answer, follow a link or press a button. Answer feedback is never announced (`QuizBlock.tsx:108-151`).
3. **The learner app is visually off-brand.** `globals.css` ships two colour systems. Marketing uses the warm brand tokens; the app uses shadcn's cool neutral greys plus raw Tailwind emerald, amber, blue and purple. `hover:bg-accent/*` resolves to brand amber, so neutral buttons glow orange on hover. Most screens look like a different product from the homepage.
4. **Contrast fails widely in the app.** Text colours chosen for a dark theme are used on light cards: emerald-400 on emerald/10 measures 1.75:1, amber-500 on amber/10 1.99:1, purple-400 links 2.6:1, blue-400 links 2.5:1. This hits dashboard CTAs, the certificate "verified" badge and capstone autosave status. The brand accent as text is 2.6:1.
5. **The curriculum has no single vocabulary.** The same module has up to four names depending on where you look. One app label is wrong for its content: slug `design` holds MVP/PRD/User Stories and is labelled "Design Thinking & UX". Lesson numbers switch between 01–10 and 1–90 on the same row.
6. **Signup and login render as "Loading…" on first paint.** On signup, the whole page, h1 included, sits inside a Suspense boundary. The live server HTML for `/signup` contains only "Loading signup...", and `/login` only "Loading login form...".
7. **The activation path leaks context.** After verifying email, the user is told "Go to Dashboard" and then bounced to onboarding. Login never returns users to where they were headed. The sample lesson's "Start Lesson N Free" drops the lesson. An unverified user is redirected to `/login?error=email_not_confirmed`, which the login page ignores.
8. **The lesson page reads poorly at desktop width.** Body text runs about 860–930px wide (~110+ characters per line). Paragraphs are 16px and lists 14px. Each lesson stacks up to 12 differently tinted callout boxes. The theory gate fails with messages like "Minimum active reading time not met (30s / 45s required)."

---

## 4. Findings

Severity scale: **Critical** = harms users or trust now. **High** = blocks or degrades a core flow, or a WCAG A/AA failure on a core surface. **Medium** = notable friction or inconsistency. **Low** = polish.

---

### UX-01 — Another person's photo is used as a learner's default avatar
**Severity:** High · **Effort:** S

**Evidence:** `apps/web/components/layout/Topbar.tsx:232-236`
```tsx
{userProfile.avatar_url || !userProfile.name || userProfile.name.toLowerCase().includes('aditya') ? (
  <img src={userProfile.avatar_url || '/avatars/aditya.png'} alt={userProfile.name || 'User avatar'} … />
```
`apps/web/public/avatars/aditya.png` exists (67 KB). The footer and certificates name the founder, Aditya Gangwani (`lib/brand.ts:36`).

**Why it matters:** Two groups see a real stranger's face presented as "you" in the header on every app page:
- anyone whose profile has no name (invite, admin-created, or a failed profile write), and
- every learner named Aditya (a very common name for this audience) who has no avatar.

It reads as a bug at best and a privacy or identity mix-up at worst.

**Fix:** Delete the `aditya` branch and the fallback image path. Render the initials circle (already in the `else` branch, lines 238-241) whenever `avatar_url` is empty. Remove `public/avatars/aditya.png` if nothing else uses it (grep shows nothing does).

---

### UX-02 — The quiz hijacks the keyboard and gives screen readers no feedback
**Severity:** High · **Effort:** S–M

**Evidence:**
- `apps/web/blocks/quiz/QuizBlock.tsx:108-151`: a `window` keydown listener is active whenever a question is on screen. It calls `e.preventDefault()` on **every** Enter and Space (lines 138-146). The only exception is INPUT/TEXTAREA; buttons, links and the tab list are not excepted. It also maps `1–4` and ArrowUp/ArrowDown globally.
- `apps/web/components/quiz/QuizOption.tsx:41-46`: options are `<button role="radio">`. Tabbing to an option and pressing Enter or Space is cancelled by the window handler before the click fires, so nothing gets selected (inference from the event order; verify in a browser). `aria-checked` is true for the *correct* option after confirming (line 43), not the learner's choice. Options become `disabled` after confirming (line 44), so the focused element disappears and focus drops to `<body>`.
- `QuizBlock.tsx:352-375`: the "Correct! / Incorrect" explanation panel has no `aria-live`, so the result is never announced.
- Hotkeys are not shown anywhere in the quiz UI. The flashcard rater does show "Use keys 0–5 or click" (`QualitySelector.tsx:45`), and it also listens on `window` (`QualitySelector.tsx:28-39`).

**Why it matters:** Keyboard-only and screen-reader learners cannot reliably answer the quiz. The quiz is the step that completes a lesson. While a quiz is mounted, the same handler also blocks Enter on "Back to Curriculum", the lesson tabs, the topbar buttons and the feedback widget.

**Fix:**
1. Attach the key handler to the quiz container (`onKeyDown` on the `role="group"` at QuizBlock line 261), not `window`.
2. Only act on keys when `e.target` is inside the radiogroup.
3. Never `preventDefault` Enter or Space when the target is a button, link or `[role=tab]`.
4. Use a native `<fieldset>` with `<input type="radio">` (or a roving-tabindex radiogroup) so arrow keys move between options and Space selects.
5. Keep focus on the confirm/next button after confirming.
6. Put the result line in `role="status"`.
7. Set `aria-checked` from `selectedOption` only, and describe the correct answer with text.
8. Show a one-line hotkey hint under the options.

---

### UX-03 — The learner app does not use the brand design system
**Severity:** High · **Effort:** M (token remap) + L (cleanup)

**Evidence:**
- **Two colour systems in one file.** `apps/web/app/globals.css:29-60` defines the warm brand palette: cream `#FBFAF6`, ink-muted `#625A4E`, primary `#1F6B4E`. Lines 89-120 add the shadcn neutral set (`--muted-foreground: oklch(0.556 0 0)` = `#737373`, `--secondary`/`--muted` = `#f5f5f5`, `--input` = `#e5e5e5`, `--ring` = `#a1a1a1`). Lines 370-380 map `text-muted-foreground`, `bg-card`, `bg-secondary`, `bg-muted`, `border-input`, `ring-ring` and `bg-destructive` to that neutral set. `--color-accent` maps to **brand amber** `#D98B24` (line 280).
- **Adoption is split by surface.** Counts of brand-token classes vs shadcn/raw-Tailwind classes:

  | Folder | Brand tokens | shadcn / raw Tailwind |
  |---|---|---|
  | `components/marketing` | 295 | 74 |
  | `components/dashboard` | 1 | 238 |
  | `components/settings` | 0 | 405 |
  | `blocks` | 0 | 240 |
  | `components/leaderboard` | 0 | 186 |
  | `app/(app)` | 0 | 335 |

  Repo-wide (non-admin): `text-muted-foreground` 608 vs `text-ink-muted` 152; `bg-card` 239 vs `bg-surface` 93. There are 848 raw Tailwind palette colour classes (emerald, amber, blue, purple, sky, indigo, violet, rose…).
- **Amber hovers.** `hover:bg-accent/40` and `/30` appear 28 times. Examples: the lesson footer buttons (`lesson-content.tsx:1036,1055`), quiz options (`QuizOption.tsx:18`), the locked-lesson "Return to Curriculum" button (`academy/[moduleSlug]/[lessonId]/page.tsx:294`). The shadcn convention is a neutral hover; here it renders as an amber wash (inference: follows from the mapping on line 280).
- **Primitives exist but are not used.** In non-admin code, `components/ui/card` is used in 0 files, `ui/badge` in 0, `ui/tabs` in 0 and `ui/toast` in 0. Each surface hand-rolls `rounded-2xl border border-border bg-card p-6 shadow-sm`. Radius usage spreads across `rounded-md` (77), `-lg` (216), `-xl` (300), `-2xl` (134) and `-full` (144).
- **Typography tokens are mostly unused.** `text-h1…text-caption` appears 171 times (mostly marketing) vs 1,202 raw `text-xs…text-5xl`. `font-serif` is used 178 times, but `--font-serif` is Inter (`globals.css:247`), so it does nothing.

**Why it matters:** The homepage was just redesigned around a warm editorial system (`components/marketing/styles.ts:15-33`). After signup, learners land in a cool-grey, multicolour, uppercase-micro-label UI that feels like a different product. That erodes trust at the moment of activation, and every new screen drifts further.

**Fix (in order of leverage):**
1. In `globals.css :root`, point the shadcn variables at brand values instead of neutrals:
   - `--muted-foreground: #625A4E` (ink-muted)
   - `--card: #FFFFFF`
   - `--secondary` and `--muted: #F2EFE7` (surface-muted)
   - `--input: #BDB4A2` (border-strong)
   - `--ring: #2F80ED` (focus)
   - `--destructive: #C2410C` (danger)
   - add `--color-destructive-foreground`

   This one edit re-skins about 1,000 usages.
2. Rename the brand amber to `--color-highlight` (or `--color-brand-accent`) and give shadcn's `accent` slot a neutral `surface-muted`, so `hover:bg-accent` stops turning orange.
3. Add app-side recipes to match `marketing/styles.ts`: `APP_CARD`, `APP_SECTION_TITLE`, `APP_LABEL`, `STATUS_SUCCESS/WARNING`.
4. Add a lint rule (there is already an `eslint-rules/` folder) banning raw palette colours (`/-(emerald|amber|blue|purple|sky|indigo|violet|rose)-\d{3}/`) outside `components/admin`.

---

### UX-04 — Widespread text-contrast failures (WCAG 1.4.3 / 1.4.11)
**Severity:** High · **Effort:** S–M

**Evidence — computed ratios** (WCAG 2.x; tints alpha-blended over the actual surface):

| Pair (where used) | Ratio | AA (4.5 text / 3.0 UI) |
|---|---|---|
| foreground `#171A17` on background | 16.8 | pass |
| ink-muted `#625A4E` on background / surface-muted | 6.5 / 5.9 | pass |
| primary `#1F6B4E` text on background; white on primary | 6.15 / 6.42 | pass |
| shadcn muted-foreground `#737373` on background / white | 4.53 / 4.73 | barely pass |
| muted-foreground on surface-muted / on `bg-secondary`/`bg-muted` | **4.12 / 4.34** | fail |
| `text-locked #8A8174` on background (404/500 body copy: `app/not-found.tsx:19,23`, `app/error.tsx:27,31,35`, `app/global-error.tsx:34,38`) | **3.67** | fail |
| accent `#D98B24` as text; `Badge variant="xp"` accent on accent/10 (`components/ui/badge.tsx:22`) | **2.62 / 2.50** | fail |
| white on accent `#D98B24` | **2.74** | fail (avoid) |
| emerald-500 text on emerald/10 (verification badge `components/certificates/VerificationBadge.tsx:19,21,35`; "Link Copied!" `CertificateActions.tsx:128`; `CapstoneCard.tsx:34`; `BadgeCard.tsx:116,137`) | **2.31** | fail |
| emerald-400 on emerald/10 (`FlashcardReviewPromptCard.tsx:26,52`; `NextCapstonePromptCard.tsx:26,48`; `LessonFeedbackWidget.tsx:220,253`) | **1.75** | fail |
| amber-500 text on amber/10 (`SubmitConfirmationModal.tsx:71` warning body; `CapstoneCard.tsx:40`; `BadgeNotification.tsx:24,29`) | **1.99** | fail |
| amber-400 on amber/10 ("N Due Today" chip `FlashcardReviewPromptCard.tsx:25`) | **1.52** | fail |
| purple-400 / blue-400 dashboard CTA links ("Start Daily Review", "Open Module N Workspace": `FlashcardReviewPromptCard.tsx:19,45`; `NextCapstonePromptCard.tsx:23,45,60,78`) | **2.60 / 2.50** | fail |
| amber-600 / emerald-600 on their /10 tint (the "fixed" variants used in many cards) | 2.95 / 3.43 | fail for text |
| capstone autosave text, amber-500 / emerald-500, 11px mono (`app/(app)/capstones/[module]/page.tsx:329,335`) | ~2.2–2.5 | fail |
| Input placeholder `muted-foreground/60` (`components/ui/input.tsx:7`) | **2.25** | fail |
| Input border `#e5e5e5` vs background (`border-input`) — form field boundary | **1.21** | fail (1.4.11) |
| Brand border `#DED8CB` vs background | 1.36 | fail if it is the only field boundary |
| skill-growth `#16A34A` / skill-leadership `#D97706` used as text on white | 3.30 / 3.19 | fail for text |
| focus `#2F80ED` vs background | 3.70 | pass (UI) |

The pattern (`text-emerald-400`, `text-amber-400`, `text-blue-400`, `text-purple-400` on `/10` tints) suggests these components were tuned against a dark mock. Dark mode is never activated (see UX-20).

**Why it matters:** These colours carry key signals: what is due, what to do next, "verified", "saved", warnings before submitting a capstone. Low-vision users and anyone on a phone outdoors cannot read them. The certificate page's main trust signal fails contrast.

**Fix:**
- Add semantic text tokens that pass on their tints. The existing `--color-success #15803D`, `--color-warning #B45309`, `--color-danger #C2410C` and `--color-info #2563EB` already pass at about 4.5–4.7 on their `-bg` tokens (computed).
- Codemod `text-(emerald|green)-(400|500|600)` to `text-success`, `text-amber-(400|500|600)` to `text-warning`, `text-(blue|sky)-400` to `text-info`, and `text-purple-400` to `text-ai`. Use `bg-success-bg` etc. for the chips.
- Replace `text-locked` body copy with `text-ink-muted`.
- Use `border-border-strong` (1.97:1; pair it with a 2px focus ring) or a darker `--input` for field outlines.
- Never put the amber accent behind text or use it as text.

---

### UX-05 — The curriculum has no single vocabulary for modules or lesson numbers
**Severity:** High · **Effort:** S–M

**Evidence:**
- **Four sources of module names.**
  - Marketing `/curriculum`: `apps/web/config/content.ts:24-96`. Confirmed on the live page: module 3 "Defining Products & PRDs", 5 "Design, UX & Prototyping", 8 "Stakeholders & Leadership".
  - App academy and onboarding: `apps/web/lib/admin/curriculum-meta.ts:26-99`, which calls them "Design Thinking & UX", "Product Strategy", "PM Leadership"…
  - Lesson header and breadcrumb: `MODULE_NAMES` in `apps/web/app/(app)/academy/[moduleSlug]/[lessonId]/page.tsx:129-139` ("Foundations", "Technical Fundamentals", "Design Thinking", "Capstone Projects").
  - Lesson metadata: `MODULE_LABEL` in the same file, lines 35-45, with different strings again.
- **At least one app label is wrong for its content.** In `content/dist/curriculum.json`, the actual module order is foundations > discovery > **design** > execution > growth > leadership > technical > **strategy** > capstone. The `design` slug contains lessons 21 "Minimum Viable Product (MVP)", 22 "Product Requirements Document (PRD)" and 23 "User Stories", yet the app calls it "Design Thinking & UX". The marketing page numbers its modules in a different order from the app.
- **Two numbering systems on one row.** In the academy list, a row shows a module-local number (`academy/page.tsx:455`, `"01".."10"`) and its aria-label says "Lesson 3: …" (line 522). The lock text on the same row says "complete Lesson 22 first" (global index, lines 427/479). The module CTA says "Continue Module 3: Lesson 23" (line 554). Breadcrumbs use "Module 01" (`lesson-content.tsx:585`) while the lesson header uses "Module 1" (line 912).
- **Naming drift elsewhere.**
  - The sidebar says "Curriculum" (`Sidebar.tsx:63`); the breadcrumb says "Academy" (the `'curriculum'` mapping at `Topbar.tsx:43` is a no-op).
  - The mobile tab says "Home" (`MobileTabBar.tsx:14`); the sidebar says "Dashboard".
  - The sidebar says "Log out" (`Sidebar.tsx:454`); the profile menu says "Sign Out" (`Topbar.tsx:297`).
  - Badges and Leaderboard share the same Trophy icon (`Sidebar.tsx:65,68`).

**Why it matters:** A visitor picks Prodily because of a curriculum page. After signup the same modules carry different names in a different order. Learners cannot match "Lesson 23" on the dashboard to the "03" row inside a module. This is the product's core navigation vocabulary.

**Fix:**
1. Make `config/content.ts` (or `curriculum-meta.ts`) the single source of `{slug, number, title, shortTitle}`. Delete `MODULE_NAMES`/`MODULE_LABEL` from the lesson page and read from the source.
2. Have content owners confirm the correct title for each slug.
3. Pick one lesson-number scheme for display. I recommend "Module 3 · Lesson 2" everywhere, with the global number only in the URL or metadata. Use it in rows, lock text, CTAs, breadcrumbs and the dashboard.
4. Pick one word each for Curriculum, Dashboard and Log out.
5. Give Leaderboard its own icon (e.g. `Users` or `BarChart`).

---

### UX-06 — Signup and login server-render only a loading placeholder
**Severity:** High · **Effort:** S

**Evidence:**
- `apps/web/app/(auth)/signup/page.tsx:455-468` wraps the **entire** page, including the h1 "Create Your Free Account" and the logo, in `<Suspense fallback="Loading signup...">`. That boundary exists because of `useSearchParams` (line 54).
- `login/page.tsx:248-256` keeps the header outside the boundary, but the form is inside it.
- Live fetch of `https://prodily.adityagangwani.me/signup`: the HTML contains only the title and "Loading signup...". Live `/login`: h1 and subtitle, then "Loading login form...".

**Why it matters:** `/signup` is the target of every primary CTA on the site. Until the JS bundle downloads and hydrates, a visitor sees a grey card that says "Loading", which hurts perceived speed and conversion on slow mobile networks. With JS disabled or failed, the page cannot be used at all.

**Fix:** Make `page.tsx` a server component that receives `searchParams` and passes `ref` (and `error`/`verified` for login) as props to a client `<SignupForm>`. Render the heading, the card shell and the static fields on the server. Only the Turnstile widget needs to hydrate.

---

### UX-07 — The activation path loses context and has one silent failure
**Severity:** High · **Effort:** S–M

**Evidence:**
- **Verification detour.** The signup verification link resolves to `/verified` (`lib/auth-url.ts:25`). That page offers only "Go to Dashboard" (`app/(auth)/verified/page.tsx:24-29`). A new user has not finished onboarding, so `(app)/layout.tsx:60-62` (and `proxy.ts:496-503`) immediately redirects to `/onboarding`. The user clicks "Dashboard" and gets a setup screen instead.
- **No return path.**
  - Unauthenticated app routes redirect to bare `/login` (`proxy.ts:460-466`; also `lesson page.tsx:105`, `dashboard/page.tsx:39`).
  - Login always goes to `json.redirect || '/dashboard'` (`login/page.tsx:124`).
  - Links in reminder emails or bookmarks to a specific lesson therefore land on the dashboard after login.
- **Sample-lesson CTA drops the lesson.** The public sample lesson's "Start Lesson {N} Free" goes to plain `/signup` (`app/(marketing)/lessons/[slug]/page.tsx:206-209`). After signup and onboarding, the learner is sent to the *recommended* lesson (`OnboardingWizard.tsx:215-222`), not the one they were reading.
- **Silent redirect.** If email verification is required, unverified users are redirected to `/login?error=email_not_confirmed` (`proxy.ts:490`, `(app)/layout.tsx:32`). The login page only handles `auth_failed` and `verification_failed` (`login/page.tsx:42-59`), so the user sees an empty login form with no explanation and no resend option.

**Why it matters:** Each extra hop or lost destination between "I'm interested" and "I'm learning" costs activations. The silent bounce looks like a broken login.

**Fix:**
1. Point the signup verification `next` at `/onboarding` and show a one-line "Email verified" notice there. Alternatively, let `/verified` link to `/onboarding` with the label "Set up your path".
2. Add a `next` param on every auth redirect (`/login?next=/academy/...`). Validate it as a same-origin path and honour it after login and after onboarding.
3. Make the sample-lesson CTA `/signup?next=/academy/{module}/{id}`. When onboarding finishes, prefer `next` over the recommended path.
4. Handle `error=email_not_confirmed` in `login/page.tsx` the same way as `verification_failed`: show the notice and the `ResendVerificationCard`.

---

### UX-08 — The lesson page reads poorly at desktop widths
**Severity:** High · **Effort:** M

**Evidence:**
- **Line length.** The lesson container is `max-w-5xl` (1024px, `lesson-content.tsx:866`) and the panel adds `p-6 md:p-8` (line 936). Paragraph blocks set no max-width (`blocks/default/DefaultMarkdown.tsx:89`). At ≥1280px the text column is about 860–930px, roughly 110–120 characters per line at 16px Inter (inference from widths and average glyph width). Comfortable reading is 60–75.
- **Mixed body sizes.**
  - Paragraphs: `text-base` (`DefaultMarkdown.tsx:89`).
  - Lists: `text-sm` (`DefaultMarkdown.tsx:72`).
  - Takeaways, mistakes, perspectives and framework bodies: `text-sm` at `text-foreground/75–80` (`SectionBlock.tsx:43,96,138,334,395,422,445`).
  - Body text alternates between 16px and 14px within one lesson.
- **Callout overload.** `SectionBlock.tsx` gives each section type its own hue from the raw Tailwind palette: primary, destructive, emerald (twice), yellow, neutral, indigo, amber, sky, violet, blue, teal, pink. Each is a bordered, tinted, shadowed box. Mental Model and Framework blocks also append an `InlineConceptCheck` "Mark Understood" button that saves nothing (`InlineConceptCheck.tsx:15,34-45`; local state only).
- **Inline markdown is unstyled.** `MarkdownRenderer.tsx:50` relies on `prose prose-a:text-primary …`, but `@tailwindcss/typography` is not installed (absent from `package.json`; no `@plugin` in `globals.css`). Every `prose-*` class is a no-op. Tailwind preflight sets `a { color: inherit; text-decoration: inherit }`, so links inside lesson text and Resources citations look like plain text, and nested lists in markdown bodies lose their bullets (inference; live lesson 1 happens to contain no inline links).

**Why it matters:** Reading is the main activity: 90 lessons at 25 minutes each for lesson 1 per the live page. Very long lines and constant colour switching make sustained reading tiring, and they compete with the content.

**Fix:**
1. Constrain the reading column to `max-w-[68ch]` (keep tables and diagrams full width).
2. Set one body size (16px) and line height (1.65) for paragraphs, lists and callout bodies.
3. Reduce callouts to three semantic treatments: "Key idea" (primary-soft), "Watch out" (warning-bg) and "Example" (surface-muted). Use a small label for the type instead of a hue.
4. Either install `@tailwindcss/typography` and add `@plugin "@tailwindcss/typography";`, or replace the `prose` classes with explicit `[&_a]:text-primary [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_code]:…` rules in `MarkdownRenderer`.
5. Remove `InlineConceptCheck`, or make it persist and count toward something.

---

### UX-09 — The theory gate and lesson tabs are opaque and partly broken
**Severity:** Medium · **Effort:** M

**Evidence:**
- **The gate fails with technical messages.** "Mark Theory as Read →" is always enabled (`lesson-content.tsx:413-422`). The server rejects early clicks with messages written for developers: "Minimum active reading time not met (30s / 45s required)." and "Insufficient scroll depth (62% / 80% required)." (`lib/xp/xp.ts:314-327`). The same error appears inline *and* as a toast titled "Engagement Requirement" (`lesson-content.tsx:695-707`).
- **Locked tabs give no reason.** They are `disabled` with only a lock icon and no explanation (`lesson-content.tsx:883-902`). The tablist has `role="tablist"` but no arrow-key handling.
- **Tab changes keep the scroll position.** `handleTabChange` (`lesson-content.tsx:563-574`) neither scrolls nor moves focus. "Mark Theory as Read" sits at the bottom of a long page, so the learner lands mid-way down a short quiz panel or at the footer (inference).
- **The h1 disappears.** The lesson title is only rendered on the Theory tab (`lesson-content.tsx:909-933`), so Quiz, Flashcards and Reflection have no h1 and no lesson title on screen.
- **The reading-progress bar does not stick.** The treatment-arm `CoreReadingProgress` is `sticky top-0` (`lesson-content.tsx:450`), but it lives inside `<main className="… overflow-y-auto">` (`AppShell.tsx:97`), which never scrolls. Sticky elements stick to their nearest overflow container, so the bar scrolls away. Even if it stuck, `top-0` would put it under the 64px sticky Topbar (inference from the CSS spec; confirm in a browser).
- **Unreadable difficulty stars.** Difficulty is rendered as `'★'.repeat(n)` (line 925). Screen readers announce "black star, black star, white star…".

**Fix:**
1. Show the gate as a quiet progress hint near the button ("Keep reading. Quiz unlocks after you reach the end.") and enable the button when the client-side thresholds are met. Keep the server check as a backstop.
2. Rewrite the server reasons in learner language.
3. Show one inline message, not a toast as well.
4. Add a tooltip or visible caption to locked tabs ("Unlocks after reading").
5. On tab change, call `window.scrollTo({top: 0})` and focus the panel heading.
6. Keep a compact title row on every tab.
7. Remove `overflow-y-auto` from `main` (the window already scrolls) and set `top-16` on the progress bar.
8. Render difficulty as text ("Difficulty 2 of 5") with `aria-hidden` on the stars.

---

### UX-10 — Feedback numbers contradict each other and the backend
**Severity:** Medium · **Effort:** S

**Evidence:**
- **Capstone XP is stated three ways.**
  - The module-complete screen promises "+100 XP" (`lesson-content.tsx:746`).
  - The submit modal promises "+150 XP" (`components/capstones/SubmitConfirmationModal.tsx:90,180`), as does the fallback success message (`app/(app)/capstones/[module]/page.tsx:149`).
  - The real value is admin-configurable (`lib/capstones-db.ts:546` uses `xpConfig.CAPSTONE_SUBMITTED`).
- **Quiz XP is recomputed on the client.** The summary uses `correctCount * 5` plus 25 (`QuizBlock.tsx:164-168`). It always labels the bonus "First-Attempt Perfect Bonus", even on retries. The server only awards it on the first attempt (`lib/xp/xp.ts` `calculateQuizXp`).
- **Review XP is hard-coded.** `+2 XP per card` (`components/review/ReviewHub.tsx:113`), although the value is configurable.
- **The first-session card contradicts itself.** It shows "Est. Time: {estimatedTime}" (`components/dashboard/FirstSessionKickoffCard.tsx:61`), which for lesson 1 is "25 min" (live page: "25 min read"), next to "Takes ~5 mins to complete" (line 79). It also hard-codes "Start Lesson 1 →" (line 76) and "+50 XP Preview" (line 41).
- **Every quiz submission completes the lesson,** whatever the score (`lib/academy/lessons-db.ts:477` `isCompleted: true`). The completion screen then says "You have mastered **{title}**" (`lesson-content.tsx:813`), even at 0/15. (Whether to require a pass mark is a product call; the copy is a UX issue either way.)

**Why it matters:** Gamification only motivates if the numbers are credible. Contradictory XP and time claims teach learners to ignore them.

**Fix:**
- Return XP amounts from the API (or a `/api/xp/config` read) and render those. Remove the client arithmetic.
- Drop "~5 mins", or compute it from data.
- Use the real lesson number in the CTA.
- Change "mastered" to "completed", and show the score with a "Retry to improve" link when it is under about 70%.

---

### UX-11 — The dashboard has no clear hierarchy and no single "next step"
**Severity:** Medium · **Effort:** M

**Evidence:**
- **No h1.** The dashboard's first heading is an `h3` in `PersonalizedGoalBanner.tsx:51`, then an `h2` in `ContinueLearningCard`.
- **Three competing "where next" signals.**
  - The goal banner says "Focus: {recommended module}" (`PersonalizedGoalBanner.tsx:43-46`).
  - "Up Next" shows the **first incomplete lesson globally** (`dashboard/page.tsx:142-152`).
  - Onboarding sent the learner to a **recommended module's entry lesson** (`OnboardingWizard.tsx:215-222`).

  For a learner whose goal recommends a later module, the banner and the big CTA point to different places (inference; it depends on the experiment arm and goal).
- **Small, low-contrast labels.** Action cards use `text-[9px]`/`text-[10px]` uppercase labels in purple-400, blue-400 and amber-400 (`FlashcardReviewPromptCard.tsx:19-29`, `NextCapstonePromptCard.tsx:23-28`). Dashboard components contain 23 `text-[10px|11px]` instances.
- **Jargon.** "Spaced Repetition SRS", "Reinforce memory retention using the SM-2 spaced repetition algorithm" (`FlashcardReviewPromptCard.tsx:20,38`).

**Fix:**
1. Add a visually modest h1 ("Welcome back, {first name}").
2. Make "Up Next" the single primary action, computed from the same resolver as onboarding (recommended path first), and fold the goal banner into its subtitle ("Lesson 23 · on your Strategy path").
3. Give secondary cards one consistent style with tokenised status colours (UX-04) and labels of at least 12px.
4. Replace "SM-2" copy with a plain benefit ("Review 6 cards to lock in what you learned").

---

### UX-12 — App-shell accessibility gaps
**Severity:** Medium · **Effort:** M

**Evidence:**
- **No skip link in the app shell.** The marketing layout has one (`app/(marketing)/layout.tsx:17-29`). The app's `<main>` has no id (`AppShell.tsx:97`).
- **The mobile drawer is not a proper modal.** `Sidebar.tsx:493-505` has no `role="dialog"`/`aria-modal`, no Escape handler, no focus move, no focus trap and no scroll lock. The marketing `navbar.tsx:187-254` already does all of these correctly.
- **No `aria-current` on active sidebar links.** The active state is colour only (`Sidebar.tsx:425-439`). The mobile tab bar does set it (`MobileTabBar.tsx:51`).
- **The profile menu fakes a menu.** It uses `role="menu"`/`menuitem` without arrow-key support or moving focus into the menu (`Topbar.tsx:247-300`).
- **Settings "tabs" are plain buttons** with no `role="tab"`, `aria-selected` or `aria-current`, so the active tab is only visual (`components/settings/SettingsTabs.tsx:58-75`).
- **Collapsed-sidebar tooltips are hover-only** (`group-hover`, e.g. `Sidebar.tsx:413-419`).
- **Missing h1s.** The dashboard has none (UX-11), nor do the quiz, flashcard and reflection tabs (UX-09). App error and not-found use `h2` (`(app)/error.tsx:26`, `(app)/not-found.tsx:12`).
- **Focus rings are inconsistent (inference from cascade layers).** `globals.css:419-422` sets `:focus-visible { outline: 2px solid var(--color-focus) }` *outside* any `@layer`. That makes it beat Tailwind's layered `focus-visible:outline-none`, so focus is always visible (good). But components also draw their own rings: grey `ring-ring/50` at 1.52:1 (`button.tsx:9`), `ring-primary`, `ring-focus`. Many elements therefore show a blue outline plus a second green or grey ring.
- **The a11y test gate does not cover the app.** `lib/__tests__/b11c-accessibility-gate.test.ts` runs axe on Button, Input, ProgressBar, EmptyState, ErrorState and Skeleton in JSDOM. The learner app barely uses these primitives (UX-03), and JSDOM cannot evaluate colour contrast, so the gate gives false confidence.

**Fix:**
- Move the marketing skip link into the app shell (`<main id="main-content" tabIndex={-1}>`).
- Rebuild the mobile drawer on `@base-ui/react` Dialog, which is already used by `components/ui/dialog.tsx`, or reuse the navbar's focus-trap effect.
- Add `aria-current="page"` to active sidebar links.
- Convert the profile menu to base-ui Menu, or drop the `menu` roles and treat it as a disclosure.
- Give the settings tabs tab semantics, or render them as links with `aria-current`.
- Show collapsed tooltips on `group-focus-within`.
- Pick one focus style, the global 2px focus outline, and remove the per-component `ring-*` focus classes.
- Extend the axe gate to render real pages (dashboard, lesson, settings) in Playwright, which is already a dev dependency (`playwright.config.ts`), with the colour-contrast rule enabled.

---

### UX-13 — Modals are hand-rolled with inconsistent behaviour
**Severity:** Medium · **Effort:** M

**Evidence:**
- Only 3 learner-facing modals use the accessible base-ui Dialog (`AchievementCelebrationModal`, `FirstSessionCelebrationModal`, `ReferralShareModal`).
- At least 9 overlays are hand-rolled, with varying Escape and focus support:
  - `ConfirmDestructiveAction.tsx:70-75`: has `role="dialog"`, but no Escape and no focus trap. Account deletion runs through this.
  - `SubmitConfirmationModal.tsx:36` and `ProfileComparisonModal.tsx:32`: no `role="dialog"` at all.
  - `ContextualFeedbackModal` and `LeaderboardPopoverModal`: Escape only, no focus management.

**Fix:** Migrate every overlay to `components/ui/dialog.tsx`, which gives one focus trap, one Escape behaviour, one backdrop and one animation. Start with `ConfirmDestructiveAction` and `SubmitConfirmationModal`.

---

### UX-14 — Form and control details hurt completion and accessibility
**Severity:** Medium · **Effort:** S

**Evidence:**
- **No autocomplete.** There are no `autoComplete` attributes on any auth field (signup name/email/password `signup/page.tsx:289-340`, login `login/page.tsx:161-197`, reset), so password managers and autofill work poorly.
- **No show-password toggle on signup or login.** Reset-password and Security settings have one (`EyeOff` present in `reset-password/page.tsx`, `SecuritySettingsTab.tsx`).
- **iOS zoom on focus.** The default `Input` is 14px (`components/ui/input.tsx:11`, `text-sm`), so iOS Safari zooms on focus. The portfolio username field already uses the correct `text-base md:text-sm` (`PortfolioSettingsForm.tsx:299`).
- **Low-contrast placeholder and border** (2.25:1 and 1.21:1, see UX-04).
- **Login validates password length.** It applies `min(6)` (`login/page.tsx:27-30`), which blocks any legacy shorter password with a misleading message.
- **Unlabeled controls.**
  - The reflection `<textarea id="reflection-content">` has no label; only a placeholder (`lesson-content.tsx:289-296`).
  - The **"portfolio public" switch has no accessible name** and no visible focus indicator. The input is `sr-only`, so the global outline lands on a 1×1 clipped box, and the wrapping `<label>` contains no text (`PortfolioSettingsForm.tsx:263-272`). This is the control that publishes a learner's profile.
- **"Delete Account" renders near-black on red at 3.68:1** (inference from the token set). It uses `text-destructive-foreground` (`DangerZoneTab.tsx:236`; also `button.tsx:22`), but `--color-destructive-foreground` is defined nowhere, so the class generates no CSS and the text inherits the body colour.
- **Onboarding issues** (`OnboardingWizard.tsx:252-260`, 276-304):
  - Errors render at the top of the page, while the CTA is at the bottom. On a phone, tapping "Start Learning" without a selection shows nothing in view.
  - The option "radios" are buttons with `role="radio"` but no arrow-key behaviour.

**Fix:**
1. Add `autoComplete="name|email|new-password|current-password"`.
2. Reuse the existing show/hide toggle on signup and login.
3. Change the `Input` default to `text-base md:text-sm`.
4. Remove `min(6)` from the login schema.
5. Add `<label htmlFor="reflection-content">` (the prompt text can be the label).
6. Give the portfolio switch a `role="switch"` button with `aria-checked` and `aria-labelledby` pointing at the "Public portfolio" heading, plus a visible focus ring on the track.
7. Define `--color-destructive-foreground: #FFFFFF` in `@theme`.
8. In onboarding, disable the primary CTA until both choices are made, or render the error directly above the CTA. Use native radio inputs.

---

### UX-15 — Silent failures and crude feedback
**Severity:** Medium · **Effort:** S–M

**Evidence:**
- **Flashcard save failures are silent.** If saving a rating fails, the review hub only logs to the console and advances to the next card (`components/review/ReviewHub.tsx:107-128`). The rating is lost without the learner knowing.
- **Native `alert()` dialogs.** Used for capstone submission errors (`app/(app)/capstones/[module]/page.tsx:161`) and the share fallback (`lesson-content.tsx:789`). The app already has a client toast bus (`dispatchClientNotificationEvent`, `showClientToast`).
- **"Share Achievement" shares a private URL.** It shares `window.location.href`, which is a private, `noindex` lesson URL behind login (`lesson-content.tsx:782-790`). Recipients hit the login wall.
- **Autosave error state is unclear.** It shows "Saved Locally" in red, at 11px, with no `aria-live` (`capstones/[module]/page.tsx:324-344`). Red plus reassuring words leaves the learner unsure whether work is safe.
- **The app error boundary** shows raw `error.message` in a monospace box under a bouncing warning icon (`app/(app)/error.tsx:21,32-36`). The copy says "this section of the academy" (old naming).
- **Lesson load error** is shown as `text-red-500` "Please reload." with no retry button (`lesson-content.tsx:670-678`).
- **One skeleton for every route.** The only `loading.tsx` for the whole `(app)` group draws a dashboard skill-radar skeleton (`app/(app)/loading.tsx`), so lessons, settings and the leaderboard all flash a dashboard-shaped placeholder first.

**Fix:**
- Show a toast and keep the card on save failure ("Couldn't save, try again").
- Replace `alert()` with the existing toast.
- Share the learner's portfolio or certificate URL (or an OG share page) instead of the lesson URL.
- Use warning colour and the text "Offline: saved on this device, will sync" inside `role="status"`.
- Show a friendly message plus the error digest instead of the raw message, and remove the bounce.
- Add a "Try again" button that calls `mutate`.
- Add route-shaped `loading.tsx` files for `academy/[moduleSlug]/[lessonId]` and `settings`.

---

### UX-16 — Mobile ergonomics
**Severity:** Medium · **Effort:** S–M

**Evidence:**
- **Settings tabs on phones.** Six tabs sit in a strip with `overflow-x-auto scrollbar-none`, and each tab is about 28px tall (`SettingsTabs.tsx:51,63`). "Referrals" and "Danger Zone" can be off-screen with no cue that the strip scrolls.
- **Small text.** Learner UI has 337 instances of 9–11px text (`text-[9px]` 20, `[10px]` 129, `[11px]` 188), mostly uppercase labels and metadata.
- **Small buttons.** Button sizes `sm` (32px), `xs` (24px) and `icon-sm` (32px) are available (`button.tsx:39-47`). Portfolio social links are 38px (`PortfolioHero.tsx:160`).
- **Crowded topbar at 360px.**
  - It holds a menu toggle, brand icon, breadcrumb, search, feedback, bell and avatar (`Topbar.tsx:93-245`). The breadcrumb is squeezed to a few characters (inference from widths).
  - The topbar menu button and the tab bar's "More" open the same drawer (`MobileTabBar.tsx:75-103`).
- **Desktop-only copy on touch devices.** Flashcards say "Click or press Space to flip" (`Flashcard.tsx:44`); the rater says "Use keys 0–5".

**Fix:**
- On phones, make settings a vertical list (or a `<select>`), or show edge fades and use at least 40px tabs.
- Set a 12px floor for any text and drop most uppercase micro labels.
- Remove the topbar menu toggle on `<lg` (the tab bar's "More" covers it) and move feedback into the drawer.
- Phrase the hint by input type ("Tap to flip").

---

### UX-17 — Motion and perceived performance in the app
**Severity:** Medium · **Effort:** S

**Evidence:**
- **Animations that ignore reduced motion.** The flashcard 3D flip uses framer-motion with no reduced-motion check (`components/review/Flashcard.tsx:26-31`); the same applies to `ProgressRingCard`/`SkillRadarCard`. `useReducedMotion` exists in `hooks/use-reduced-motion` and is used by the marketing components. There are also 13 `animate-bounce|pulse|ping` uses without `motion-reduce:`, including the error-boundary icon (`(app)/error.tsx:21`), the quiz trophy (`QuizBlock.tsx:177`) and the first-session celebration (`FirstSessionCelebrationModal.tsx:48`).
- **A perpetual spinner around the avatar.** The avatar ring spins forever with a green glow on every app page (`Topbar.tsx:203-204`). It respects reduced motion, but it is constant motion in peripheral vision while reading.
- **Sidebar shifts on hydration.** The collapsed state reads localStorage through `useSyncExternalStore`, with a server snapshot of `false` (`AppShell.tsx:48-58`). Learners who collapsed the sidebar get a 256px → 72px shift on every page load (inference: hydration renders the server snapshot first).
- **Dead animation classes.** `animate-fade-in`, `animate-scale-up`, `animate-scale-in` and `animate-slide-down` are used 19 times but defined nowhere. Not in `globals.css`, not in `tw-animate-css`. They are harmless no-ops, but they show intended motion that never runs.

**Fix:**
- Wrap the app in `<MotionConfig reducedMotion="user">` (one line in `AppShell`) and add `motion-reduce:animate-none` to the bounces.
- Make the avatar ring static, or animate it only after an XP change.
- Store the sidebar state in a cookie and read it in the server layout, so SSR renders the right width.
- Delete the undefined classes, or define them once.

---

### UX-18 — Recruiter-facing pages lead with gamification and internal jargon
**Severity:** Low–Medium · **Effort:** S

**Evidence:**
- **The public portfolio hero repeats game stats.** Level and Total XP appear twice (`PortfolioHero.tsx:112-116` and again in the badges at 142-150), and the current streak is shown publicly ("0 Day Streak" is possible). The "Verified" icon has only a `title` attribute (`PortfolioHero.tsx:97-101`), so screen readers do not announce it. The name `h1` has `truncate` (line 95), which can cut off long names.
- **Jargon on the portfolio footer:** "90 lessons · 9 modules · 0 dark patterns · Static-first verified architecture." (`app/(portfolio)/p/[username]/page.tsx:201`).
- **Jargon on the certificate page:** "AST Verified" (`app/verify/[certificateId]/page.tsx:259`) and "Immutable Verification Code … · 0 dark patterns." (line 286). The certificate code prefix is still `PMA` (`lib/brand.ts:37`), a leftover from "PM Academy".

**Fix:**
- Lead with capstones and skills. Show XP and level once, as secondary information, and hide streaks on the public view (or make them opt-in).
- Add `aria-label="Verified portfolio"` to the verified icon.
- Replace the footers with plain trust copy ("Issued by Prodily · Verify at …").
- Decide whether `PMA-` codes stay for continuity and document that decision.

---

### UX-19 — App microcopy tone and jargon
**Severity:** Low · **Effort:** S

**Evidence:**
- **Danger Zone copy is written for developers:** "Permanently cascades user data across all tables" and "record an auditing negative XP entry in the ledger" (`DangerZoneTab.tsx:150,230,265`).
- **The flashcard rater has six levels:** "Blackout / Incorrect / Difficult / Pass / Good / Perfect" (`QualitySelector.tsx:13-20`). That is heavy for beginners.
- **Gaming tone and emoji** sit next to the restrained marketing voice: "Flawless Victory!" (`QuizBlock.tsx:189`), emoji tour titles (`quick-start-steps.ts:45-139`), 👑 (`lesson-content.tsx:833`, `ContinueLearningCard.tsx:36`).
- **Wrong moment for the tour.** It opens after the first completed lesson but says "Your PM Learning Journey Starts Here" and "You're Ready to Start!" (`quick-start-steps.ts:46,139`).
- **The locked-lesson copy is stern:** "You must complete…" (`academy/[moduleSlug]/[lessonId]/page.tsx:254,267`).

**Fix:**
- One voice pass over the app, using the marketing tone as the reference.
- Plain-language consequences in the Danger Zone ("Deletes your account, lessons, capstones and portfolio. Certificates stop verifying.").
- Consider a 4-button rater (Again / Hard / Good / Easy) mapped onto SM-2 grades.
- Retitle the post-lesson tour ("Here's what else Prodily does").
- Rephrase locks as next steps ("Finish Lesson 22 to unlock this").

---

### UX-20 — Dark mode is half-built
**Severity:** Low · **Effort:** S (decide) / L (ship)

**Evidence:**
- Full dark tokens exist (`globals.css:129-197`), with comments saying they are "DEFINED but NOT ACTIVATED" (123-127). There is no ThemeProvider, `.dark` toggle or `prefers-color-scheme` handling anywhere.
- 163 `dark:` classes across 64 files are dead code.
- `viewport.themeColor` is single-valued (`app/layout.tsx:107`).
- The light-mode contrast failures in UX-04 look like dark-first choices.

**Fix:** Either ship it with `next-themes` and system preference (most of the token work is done; it then needs a contrast pass), or delete the `dark:` classes so new code stops being written against a theme nobody sees.

---

### UX-21 — Design documentation has drifted from the code
**Severity:** Low · **Effort:** S

**Evidence:**
- **Old brand in the docs.** `docs/DESIGN_SYSTEM.md:1` is titled "Prodily PM Academy".
- **Admin palette described wrongly.** The doc (lines 25-30) and `theme/tokens.ts:37-58` describe a dark navy admin palette, but the live `.admin-console` tokens are light slate (`globals.css:205-233`).
- **Feedback button described wrongly.** The doc (§4.B, lines 71-74) says it shows a "Feedback" text label at `md+`. In the code it is an icon-only Pencil at every size (`Topbar.tsx:169-184`).
- **Muted-text value disagrees.** `tokens.ts:18` has `textMuted '#70685A'` while CSS `--color-ink-muted` is `#625A4E` (`globals.css:58`).
- **Onboarding comment is stale.** `onboarding-destinations.ts:4-7` says the primary CTA lands on `/dashboard`; the wizard actually routes to the recommended lesson (`OnboardingWizard.tsx:215-222`).

**Fix:** Regenerate `DESIGN_SYSTEM.md` from `globals.css` and `marketing/styles.ts`. Make `tokens.ts` derive from the same values, or add a test that asserts they match.

---

### UX-22 — Orphans and dead UI
**Severity:** Low · **Effort:** S

**Evidence:**
- **Orphan routes.** `/progress/milestones` exists but nothing links to it. `/progress` redirects to `/progress/radar` (`app/(app)/progress/page.tsx`). `/notifications` redirects to `/dashboard` (`app/(app)/notifications/page.tsx`), so notification deep links lose their target.
- **Unused components.** `components/progress/ProgressSectionDropdown.tsx` is imported nowhere. Several marketing sections are not imported by any page: `experience.tsx` (453 lines, hard-coded hex), `journey.tsx`/`journey-timeline.tsx`, `faq.tsx`, `community.tsx`, `feature-card.tsx`, `testimonial-card.tsx`.
- **Absolute logo links.** The auth pages' logo links to an absolute `https://prodily.adityagangwani.me` (`signup/page.tsx:189`, `login/page.tsx:234`). That causes a full reload, breaks on preview deployments, and conflicts with the stated `prodily.app` domain. Use `/`. (`BRAND.domain`/`siteUrl` live in `lib/brand.ts:10,26`; the domain question itself is for the SEO/engineering auditors.)

**Fix:** Link milestones from the Progress submenu or delete the route. Point `/notifications` at the drawer (e.g. `/dashboard?notifications=open`). Delete the dead components (flagged for the code-quality auditor). Make logo links relative.

---

## 5. Prioritized action plan

### Now (this sprint, mostly S effort)
1. **UX-01:** Remove the `aditya.png` avatar fallback and render initials.
2. **UX-02:** Scope the quiz and rater key handlers to their containers, stop swallowing Enter/Space, and add `role="status"` feedback.
3. **UX-06:** Server-render the signup and login shells. Pass `searchParams` as props.
4. **UX-07:** Handle `error=email_not_confirmed` on login, route verification to `/onboarding`, and add a validated `next` param through login, signup and onboarding.
5. **UX-14 (quick part):** `autoComplete`, `text-base` inputs, the reflection label, the portfolio switch's name and focus, and define `--color-destructive-foreground`.
6. **UX-04 (codemod):** Replace emerald/amber/blue/purple-400/500 text with the success, warning, info and ai tokens; replace `text-locked` body copy with `text-ink-muted`.
7. **UX-10:** Remove "~5 mins", "Start Lesson 1", hard-coded XP and "mastered" copy.

### Next (2–6 weeks)
1. **UX-03:** Remap the shadcn variables to brand values, split the amber accent out of the `accent` slot, add app style recipes, and add a lint rule against raw palette colours.
2. **UX-05:** Single module-name source, one lesson-numbering scheme, and correct the `design` module title.
3. **UX-08:** 68ch reading column, one body size, three callout treatments, and inline markdown styling.
4. **UX-09:** Learner-friendly gate, locked-tab hints, scroll and focus on tab change, persistent title, sticky-bar fix.
5. **UX-12 / UX-13:** Skip link, drawer and all modals on base-ui Dialog, `aria-current`, one focus style, and a Playwright axe run on real pages.
6. **UX-11:** Dashboard h1 and a single "Up Next" driven by the onboarding resolver.
7. **UX-15:** Toasts instead of silent failures and `alert()`, share portfolio/certificate URLs, route-shaped skeletons.

### Later
- **UX-20:** Decide on dark mode: ship it or strip it.
- **UX-16 / UX-17:** Mobile settings list, 12px text floor, `MotionConfig reducedMotion="user"`, cookie-backed sidebar state.
- **UX-18 / UX-19:** Recruiter-first portfolio and certificate copy, app voice pass, 4-level flashcard rater.
- **UX-21 / UX-22:** Regenerate design docs, remove orphans and dead components.

---

## 6. What's already good

- **The marketing navbar is a model implementation.**
  - The mobile sheet does focus-in and focus-return, a Tab trap and Escape (`navbar.tsx:187-254`).
  - It makes the background `inert` and locks scroll.
  - Every target is 44px.
  - The signed-in/out CTA swaps without layout shift (`navbar.tsx:93-136`).
- **The marketing design system is real and documented.** `components/marketing/styles.ts` defines shared recipes with written rules. Motion is CSS-only and reduced-motion-safe (`globals.css:590-643`). The hero animates transform only, so the LCP headline paints opaque (`hero.tsx:15-21,47`). The homepage is almost entirely server components.
- **Onboarding is one short screen with good defaults.** Two choices, a draft saved to localStorage, a live non-blocking "Recommended start" hint, and identity fields deferred to Settings (`OnboardingWizard.tsx`).
- **The academy list communicates state without relying on colour.** It uses `<details>`/`<summary>` modules, visible "Locked · complete Lesson N first" text, an sr-only status, and locked rows that are not links (`academy/page.tsx:420-515`). The locked-lesson page offers a direct "Start Lesson N" CTA.
- **Destructive actions are well guarded.** Each needs a typed keyword ("RESET"/"DELETE") and states in plain language what will be lost (`DangerZoneTab.tsx`). Settings has an unsaved-changes guard (`hooks/use-dirty-form-guard.tsx`).
- **The dashboard streams its slow parts.** The leaderboard and proof extras are behind Suspense, so they never block the page (`dashboard/page.tsx:44-76, 269-286`).
- **Robust details:**
  - Block-level error boundaries with friendly copy, so one broken block never blanks a lesson (`renderer/block-tree-renderer.tsx:44-60`).
  - A notification drawer constrained for mobile, with focus and Escape handling.
  - A cookie banner with equally weighted Accept and Reject.
  - Auth errors wired to inputs with `aria-describedby` and `aria-invalid`.
