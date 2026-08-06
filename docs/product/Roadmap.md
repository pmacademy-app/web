# Prodigy PM Academy — Roadmap (Phase 3.7 → Public Launch)

**Status:** Authoritative sequencing document from this point forward. **Supersedes `Phases.md`** for everything after Phase 3 (Phases 0–3 in `Phases.md` are historical record — accurate, complete, and archived alongside this doc's predecessor once this ships; see `Documentation-Synchronization-Report.md §2.1`).
**Companion docs:** `../INDEX.md`, `PRD.md`, `../architecture/Architecture.md` (esp. the narrowed freeze in §0), `../reports/Architecture-Review-Report.md`, `../reports/Product-Review-Report.md`, `Brand-Architecture.md`, and the per-sprint docs under `docs/roadmap/`.
**Where the project actually is:** `v1.0.0-rc1`. Phases 0–3 (Foundation → Core Loop → Gamification → Depth/Retention, including capstones, badges, leaderboard, portfolio, certificates, and the notification platform) are complete per `CURRENT_STATUS.md`. This document picks up from there.

---

## How to read this document

Each sprint below states **Goal**, **Deliverables**, and **Definition of Done** inline. The full spec for each sprint — UI changes, backend changes, database changes, API impact, testing checklist, out-of-scope items, risks, and future extensions — lives in its own file under `docs/roadmap/` so this document stays scannable as a sequencing map. `Sprint 7.1`'s full spec (`docs/roadmap/Sprint-7.1-Global-Branding-Documentation.md`) is delivered as the template; the remaining sprint specs follow in the same format.

---

## Phase 3 (cont'd) — Product Completion

### Sprint 7.1 — Global Branding & Documentation
**Goal:** Establish `Prodigy` / `PM Academy` brand architecture in code and finish synchronizing all documentation (this rewrite).
**Deliverables:** `lib/brand.ts` config; `BrandLogo` component + static asset set; rebrand every page title/email template/certificate field; `KNOWN_ISSUES.md` resolved-items sweep; Mermaid build-time SVG pipeline stage.
**DoD:** Zero hardcoded "PM Academy" strings remain outside `lib/brand.ts`; every doc in `docs/` reflects the new brand and the corrected roadmap; a lesson containing a Mermaid diagram renders it as a build-time static asset with no client-side Mermaid JS shipped.
**Full spec:** `docs/roadmap/Sprint-7.1-Global-Branding-Documentation.md`

### Sprint 7.2 — Settings 2.0
**Goal:** Ship the unified Settings IA (`Architecture-Review-Report.md §4`): Profile, Security, Portfolio, Notifications, Danger Zone.
**Deliverables:** Settings navigation restructure; six ledger-respecting reset actions + Delete Account cascade; typed-confirmation dialog component (reused across all seven destructive actions); notification preference UI wired to `Notification-Architecture.md §11`'s preference model.
**DoD:** Every reset action writes an auditable record (no raw `DELETE`/`UPDATE` on gamification state); Delete Account correctly cascades across every RLS-protected table and revokes public portfolio/certificate-profile linkage; all seven destructive actions require typed confirmation and cannot be triggered accidentally (no single-click destructive UI).

### Sprint 7.3 — Certificate System 2.0
**Goal:** Premium certificate experience with versioning, QR verification, and LinkedIn compatibility.
**Deliverables:** `template_version` column (additive migration); redesigned certificate layout per `Design.md`'s unified design language; QR code linking to `/verify/[certificateId]`; "Add to LinkedIn Profile" deep link; certificate sharing flow.
**DoD:** A previously issued certificate renders unchanged after a template update (version-pinned); QR code scans resolve to the correct public verification page; the LinkedIn add-to-profile link populates name/issuer/credential ID/URL correctly.

### Sprint 7.4 — Admin Console Polish
**Goal:** Reorganize Admin IA per `Architecture-Review-Report.md §2` (Overview / Content / Users / Communications / Certificates / Feedback / System).
**Deliverables:** Nav restructure; merge Notifications+Emails into Communications; convert user inspection to a drawer; new Feedback moderation view; new Content view housing Feature Flags + Marketing Controls.
**DoD:** No duplicate top-level nav items for the same subsystem; user inspection never navigates away from the Users table; an admin can approve a testimonial and see it reflected on the marketing site without a deploy.

### Sprint 7.5 — Security & Performance
**Goal:** Produce the missing standalone artifacts identified in `Architecture-Review-Report.md §7` and verify (not assume) the existing budgets.
**Deliverables:** `Security-Threat-Model.md` (new); `Performance-Budget-Checklist.md` (new, operationalizing `Design.md §4`); a real Lighthouse/axe audit run against lesson pages, dashboard, and the new Settings/Admin surfaces.
**DoD:** Threat model covers auth, RBAC, RLS, API validation, rate limiting, headers, and audit logging with an explicit mitigation per threat; performance checklist has a pass/fail result recorded per page type, not an estimate.

### Sprint 7.6 — Dashboard & Learning Experience
**Goal:** Formalize the Dashboard-vs-Progress separation the brief calls for.
**Deliverables:** Dashboard scoped strictly to "what should I do next" (continue-learning CTA, streak-at-risk state, due flashcards, next capstone); Progress scoped strictly to "how have I performed" (skill radar, XP/level history, certificate eligibility, badge case). Any element currently duplicated across both is removed from one.
**DoD:** No single piece of information (e.g., streak count) is the *primary* focus of both screens simultaneously — each screen has one clear job, matching `PRD.md §2`'s IA principle that competency (Progress), not completion, is the north-star metric, while Dashboard stays action-oriented.

---

## Phase 4 — Public Launch Preparation

### Sprint 8.1 — Marketing Website v2
**Goal:** Final launch website: Hero, Features, Curriculum preview, Testimonials (sourced from Feedback moderation), FAQ, Buy Me A Coffee, About, Contact, Privacy, Terms.
**Deliverables:** Full page set per `Design.md §6`; testimonial section wired to Admin-approved Feedback records; domain finalized in `lib/brand.ts`.
**DoD:** Every page renders with the Sprint 7.1 brand system; testimonials update without a deploy when an admin approves a new one; Privacy/Terms are real, reviewed legal pages, not placeholders (see Sprint 8.3).

### Sprint 8.2 — Marketing Content & SEO
**Goal:** SSR/SEO pass on lesson pages and marketing pages — this is the item `Phases.md` (predecessor doc) originally scoped as "Phase 4" search-and-SEO work; **client-side search UI enablement (`SearchOverlay`) belongs here**, not in a separate sprint, since it's one pipeline-adjacent stage plus one component per the original plan.
**Deliverables:** Structured data (Article/Course schema) on public lesson previews; sitemap; `Cmd/Ctrl+K` `SearchOverlay` turned on against the already-generated FlexSearch index (`rendering-pipeline.md §8`); Open Graph tags site-wide.
**DoD:** Public lesson pages are indexable and pass structured-data validation; search returns relevant, block-aware results in <100ms perceived latency across all 90 lessons.

### Sprint 8.3 — Legal & Support
**Goal:** Real Privacy Policy, Terms of Service, and a support/contact channel.
**Deliverables:** Legal copy (naming `Prodigy` as the entity, per `Brand-Architecture.md §2`); support contact flow; Google Analytics privacy configuration verified (IP anonymization, per `Architecture.md §9`).
**DoD:** Legal pages are live and linked from the footer/signup flow; a support request has a real destination (email or ticketing), not a dead-end form.

### Sprint 8.4 — Notification UX
**Goal:** Ship the right-side Notification Panel (`Architecture-Review-Report.md §3.1`), replacing the dedicated Notifications page.
**Deliverables:** `NotificationPanel` component (slide-over, reusing `NotificationBell` trigger + existing data layer); dedicated Notifications page route removed/redirected.
**DoD:** All existing notification functionality (read/unread, preferences link, mark-all-read) is available from the panel; no dead route left behind.

### Sprint 8.5 — Mobile Experience
**Goal:** Verify and polish the responsive experience across all new surfaces (Settings 2.0, Certificates 2.0, Notification Panel, Marketing v2) — this product is responsive-web-only (`PRD.md §6` — no native app), so "mobile experience" means confirming the existing responsive design system holds up on the newest screens, not building a new platform.
**Deliverables:** Mobile pass on every screen shipped in Sprints 7.1–8.4; the Notification Panel's mobile behavior (full-screen takeover vs. slide-over) specified explicitly.
**DoD:** Every screen shipped this phase meets the WCAG AA + performance budgets on mobile viewport widths, verified per `Sprint 7.5`'s checklist.

### Sprint 8.6 — Public Launch QA
**Goal:** Final hardening pass before Phase 5.
**Deliverables:** Full regression pass across the core reading→quiz→unlock loop (the Phase 1 zero-P0 gate, still the highest-priority invariant per `Phases.md`'s original launch-week criteria); closed-beta-style dry run if time allows.
**DoD:** Zero P0 bugs in the core loop; every Definition of Done from Sprints 7.1–8.5 independently re-verified, not just trusted from when each sprint shipped.

---

## Phase 5 — Public Launch

Unchanged from the original `Phases.md` plan — launch channels (Product Hunt, Reddit, LinkedIn, SEO, partnerships) and launch-week success criteria (Day-1 completion, Day-7 retention, quiz completion rate as the three metrics that actually matter, not raw signups) remain correct and are carried forward without modification. See the archived `Phases.md` for the full original detail, preserved as historical record.

---

## Gaps Identified Before Public Launch (Final Review)

1. **Domain name is not yet finalized** — blocks `lib/brand.ts` completion in Sprint 7.1 and the whole of Sprint 8.1/8.3. Flagging as the single highest-priority open decision for the founder to resolve before Sprint 7.1 starts.
2. **Legal review of Privacy/Terms** (Sprint 8.3) needs either a founder-drafted pass or a real legal review — this document can produce a structural template but should not be treated as legal advice.
3. **Feedback moderation volume is unknown** — the "manual moderation is fine at this scale" call in `Product-Review-Report.md §4` assumes a v1 launch. Re-check this assumption once real testimonial volume exists post-launch.
4. **No item in this roadmap currently reintroduces AI Mentor, a global leaderboard, or lesson paywalling** — confirming these stay cut is itself a pre-launch checklist item, since brief-writing momentum is exactly the situation `Rules.md §6.4` warns can cause a settled decision to get silently reopened.
5. **The full cross-product `Design.md` rewrite has no dedicated sprint.** Several sprint docs (e.g. `Sprint 7.4`'s Admin theming, `Sprint 7.3`'s certificate template, `Sprint 8.1`'s marketing visual language) assume "the unified design language" exists by the time they execute, but no single sprint above owns producing it end-to-end — it was implicitly distributed. **Resolution:** insert this as explicit early work inside `Sprint 7.1` (Global Branding & Documentation already touches every visual surface for rebranding purposes — extending it to also finalize `Design.md`'s unified tokens is the cheapest place to close this gap) rather than adding a 13th sprint. Flagged here so it isn't silently dropped.

---

## Changelog

- v1.0 (2026-08-06) — Replaces `Phases.md` as the forward-looking roadmap from Phase 3.7 onward. Phases 0–3 history preserved in the archived `Phases.md`; Phase 5 launch-week detail carried forward unchanged.
