# Prodigy PM Academy — Product Requirements Document

**Companion docs:** `INDEX.md`, `Architecture.md` (esp. §0 on freeze scope), `Roadmap.md` (supersedes `Phases.md` from Phase 3.7 onward), `Design.md`, `Brand-Architecture.md`, `Architecture-Review-Report.md`, `Product-Review-Report.md`.

---

## 1. Positioning

**Full name:** Prodigy PM Academy (`Brand-Architecture.md`). **Tagline:** "The Duolingo of Product Management."

**Product Principles (unchanged, locked since Phase 0):**
1. The core learning loop (theory → quiz → unlock) is the product. Everything else supports it, never distracts from it.
2. **Free-forever core curriculum** — the single biggest differentiator. Given explicit, prominent homepage treatment as of `Sprint 8.1`, not left as an implied absence of a pricing page.
3. Competency over completion — the Skill Radar, not a percent-complete bar, is the north-star signal (§4.8, reinforced by the Dashboard/Progress split in `Roadmap.md` Sprint 7.6).
4. Solo-founder buildable, ₹0 infrastructure at launch scale (`Architecture.md §1`).

## 2. Information Architecture

**Dashboard vs. Progress — a distinction that existed in principle since early phases but was not consistently enforced in the shipped product until Sprint 7.6:**

- **Dashboard** answers *"What should I do next?"* — continue-learning CTA, streak-at-risk state, due flashcards, next capstone prompt.
- **Progress** answers *"How have I performed?"* — Skill Radar (still the single most prominent element), XP/level history, streak history, certificate eligibility, badge case.

See `Roadmap.md` Sprint 7.6 for the audit-driven process that closed the gap between this principle and what had actually shipped.

## 3. Target User

Unchanged: early-career professionals and career-switchers seeking PM competency without a bootcamp price tag or a multi-month time commitment; skeptical of "become a PM in 30 days" claims, responsive to credible, free, well-structured content.

## 4. Core Features (locked, unless noted "extended this phase")

### 4.1–4.7 Curriculum, Theory/Quiz/Unlock loop, XP system, Streaks, Flashcards/SRS, Reflections, Bookmarks
Unchanged. See `Architecture.md §6` for the implementing modules; frozen per `Architecture.md §0`.

### 4.8 Skill Radar
Unchanged, locked formula — 7-cluster competency scoring, single implementation in `lib/skillRadar.ts`. Explicitly reaffirmed as *not* up for redesign this phase (`Product-Review-Report.md §2`) — it's the product's stated core differentiator and no redesign signal exists for it.

### 4.9 Badges
Unchanged — ~20 cap, must map to real milestones, never filler. The discipline behind this cap is explicitly the standard every *new* feature this phase is held to (`Product-Review-Report.md §2`).

### 4.10 Leaderboard
Unchanged — cohort-only, consistency-ranked (not raw XP), opt-in. A deliberate anti-pattern stance against global/gaming-prone leaderboards, reaffirmed this phase with no change (`Product-Review-Report.md §2`).

### 4.11 Certificates — **Certificate System 2.0 (extended this phase, Sprint 7.3)**
Certificates remain a credibility artifact, not a personalization surface — no per-user custom themes. **New this phase:**
- `template_version` field so a design refresh never alters an already-issued certificate (`Architecture.md §2`).
- QR code on the exported certificate linking to the existing `/verify/[certificateId]` page.
- "Add to LinkedIn Profile" deep link (issuer = `Prodigy`, per `Brand-Architecture.md §2`).
- Refreshed layout/typography per the unified design language (`Design.md`).

### 4.12 Settings — **Settings 2.0 (new/consolidated this phase, Sprint 7.2)**
Final IA: Profile, Security, Portfolio, Notifications, Danger Zone (Reset Progress, Reset XP, Reset Flashcards, Reset Streak, Reset Skill Radar, Delete Account). Every destructive action requires typed confirmation and writes an auditable ledger record rather than a raw deletion — see `Architecture-Review-Report.md §4` for the full reasoning. This is the first phase these six reset actions + delete exist as a coherent, unified surface rather than scattered/ad hoc.

### 4.13 Feedback System — **new this phase (Sprint 7.4)**
Triggered after: 3 lessons completed, module completion, certificate completion. Learner-submitted testimonials enter an Admin moderation queue (approve/edit/reject, then publish) and, once published, surface on the Marketing site (`Sprint 8.1`). Deliberately kept manual (no automated sentiment scoring) — see `Product-Review-Report.md §3.1` for why that's the right scope at current volume.

### 4.14 Notification & Email Platform
Architecturally unchanged — `Notification-Architecture.md` remains authoritative and is not being rebuilt. **UX change only:** the dedicated Notifications page is replaced with a right-side panel (Sprint 8.4), matching the Linear/GitHub/Slack pattern. See `Architecture-Review-Report.md §3` for why the underlying event/queue/retry system is extended, not redesigned.

### 4.15 Admin Console — **reorganized this phase (Sprint 7.4)**
Same capabilities, new information architecture: Overview, Content, Users, Communications, Certificates, Feedback, System. Security model (dual-layer auth) is explicitly unchanged — this is an IA change, not a capability or security change. Full reasoning: `Architecture-Review-Report.md §2`.

## 5. Non-Functional Requirements

Unchanged core targets (Lighthouse ≥ 90, WCAG AA, i18n-ready infrastructure without shipped translations, IP-anonymized analytics). **This phase adds enforcement, not new targets:** `Security-Threat-Model.md` and `Performance-Budget-Checklist.md` (Sprint 7.5) turn these from documented intentions into measured, dated, pass/fail results, re-verified again at mobile viewport widths (Sprint 8.5) and again at final launch QA (Sprint 8.6).

## 6. Explicit Non-Goals

Unchanged: no native mobile app (responsive web only — `Roadmap.md` Sprint 8.5 is a verification/polish pass on the existing responsive design, not a new platform), no server-side search, no AI Mentor (reaffirmed cut this phase, `Product-Review-Report.md §4` — no new justification exists to reopen a settled decision), no global leaderboard, no lesson paywalling, no general-purpose Admin CMS (`Product-Review-Report.md §4`).

## 7. Anti-Patterns We're Deliberately Avoiding

Unchanged list (global leaderboards, dark-pattern streak guilt, paywalling core content, infinite badge grinding) — reaffirmed, none reopened this phase.

## 8. Marketing Site Requirements — **v2 this phase (Sprint 8.1)**

Hero, Features, Curriculum preview (existing 3–5 public sample lessons, audited not rebuilt), Testimonials (live from the Feedback System, §4.13 — no hardcoded copy), FAQ, Buy Me A Coffee (external link/embed — no payment infra built or maintained by this codebase), About, Contact, Privacy, Terms. Free-forever messaging (§1, Principle 2) given explicit, prominent, dedicated treatment — not implied.

## 9. Launch Readiness Gaps (carried from `Roadmap.md`)

1. Domain name not yet finalized — blocks `lib/brand.ts` completion and downstream Marketing/Legal work; the single highest-priority open founder decision.
2. Privacy/Terms content (`Sprint 8.3`) needs founder or professional legal review — documentation work alone doesn't constitute that review.
3. Feedback moderation assumed low-volume for v1; re-check the assumption once real testimonial volume exists post-launch.

## 10. Monetization

Unchanged — free-forever core, Buy Me A Coffee only at launch. No pricing page, no gated content. Any future monetization model is explicitly out of scope for this phase and would require reopening this document deliberately, not incidentally.

## 11. Explicitly Cut Features (with rationale, reaffirmed this phase)

- **AI Mentor / AI-generated capstone feedback** — cut for breaking the ₹0-infra principle at volume (no free tier for LLM calls at scale). Reaffirmed cut in `Product-Review-Report.md §4`; nothing in this phase's brief provides new justification to reopen it.
- **General-purpose Admin CMS** — deferred; Marketing Controls (`Sprint 7.4`) covers the actual current need without the complexity of a real CMS.
- **Automated testimonial sentiment scoring** — deferred until volume justifies it.
- **Push/SMS/WhatsApp notification channels** — architecturally anticipated (`Notification-Architecture.md §1`) but not built; no current need.

---

## Changelog

- v3.0 — Prodigy PM Academy rebrand; added §4.11–§4.15 covering Certificates 2.0, Settings 2.0, Feedback System, Notification UX change, and Admin Console reorganization; added §9 (Launch Readiness Gaps) and reaffirmed §11 (Explicitly Cut Features) against this phase's Product Review.
- v2.x — See `Architecture.md`'s parallel version history; prior PRD versions preserved in version control.
