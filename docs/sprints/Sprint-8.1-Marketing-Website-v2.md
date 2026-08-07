# Sprint 8.1 — Marketing Website v2

**Phase:** 4 (Public Launch Preparation) · **Depends on:** Sprint 7.1 (brand assets/domain), Sprint 7.4 (Feedback moderation must exist to source real testimonials), Sprint 7.3 (certificate showcase, if included, needs the final template). · **Blocks:** Sprint 8.2 (SEO pass targets these pages), Sprint 8.3 (Legal pages link from this site's footer/signup).
**Companion docs:** `../design/Design.md §6` (owns the content structure/SEO strategy this sprint implements), `../product/PRD.md §8` (functional requirements for the marketing site), `../product/Brand-Architecture.md`.

---

## Goal

Ship the final public marketing site: Hero, Features, Curriculum preview, Testimonials, FAQ, Buy Me A Coffee, About, Contact, Privacy, Terms — replacing the pre-launch waitlist-era site with the real launch site.

## Deliverables

1. Full page set under `app/(marketing)/`: `/` (Hero + Features + Curriculum preview + Testimonials + FAQ), `/about`, `/contact`, `/privacy` (stub — real content in Sprint 8.3), `/terms` (stub — real content in Sprint 8.3), Buy Me A Coffee integration (external link/embed, not a payment processor — no infra cost per `Architecture.md §1`'s free-tier discipline).
2. Testimonials section wired live to `GET /api/testimonials` (Sprint 7.4) — no hardcoded testimonial copy.
3. Curriculum preview: the 3–5 fully public sample lesson pages already required by `PRD.md §8` (may already exist from the pre-launch site — audit and carry forward, don't rebuild if they already meet the bar).
4. `lib/brand.ts`'s `domain` and `social` fields finalized with real values (this sprint is the forcing function for the founder decision flagged in `Roadmap.md`'s Gaps section).
5. Free-forever model messaging (Product Principle #2, `PRD.md §1`) given explicit, prominent treatment on the homepage — not just implied by "no pricing page."

## UI Changes

- This is primarily a UI sprint: the full marketing page set, built to `Design.md`'s unified design language (post-7.6-rewrite, if that rewrite has landed by this point — see Roadmap note below on sequencing risk).
- Reuses `BrandLogo` (Sprint 7.1) for in-React marketing chrome, static logo asset for anything outside the React tree (e.g., Open Graph image).

## Backend Changes

- None beyond consuming the existing `GET /api/testimonials` endpoint (Sprint 7.4) — this sprint is frontend-heavy by design; the backend work it depends on already shipped.

## Database Changes

None.

## API Impact

- Consumes `GET /api/testimonials` (read-only, public, Sprint 7.4). No new endpoints introduced by this sprint itself.

## Testing Checklist

- [ ] Every page in the deliverable list renders correctly on desktop and a spot-check mobile viewport (full mobile pass is Sprint 8.5, but this sprint shouldn't ship visibly broken mobile layouts in the interim).
- [ ] Testimonials section reflects live Admin-approved content — verify by approving a new testimonial in Admin and confirming it appears without a redeploy.
- [ ] Free-forever messaging is present and prominent on the homepage (a manual content-review checklist item, not just a technical one — Product Principle #2 is explicitly the biggest differentiator per `PRD.md §1`, worth a deliberate check).
- [ ] `lib/brand.ts`'s domain/social fields contain final, real values — no placeholders remain.
- [ ] Sample lesson pages render correctly for a logged-out visitor.

## Definition of Done

- Full page set live and passing the testing checklist.
- Every page sources brand strings/assets from `lib/brand.ts`/`BrandLogo` — zero hardcoded brand references introduced in this sprint (regression check against Sprint 7.1's grep-based CI rule).
- Testimonials are live, not hardcoded.

## Out of Scope

- SEO structured data / sitemap / search UI — Sprint 8.2.
- Final legal copy — Sprint 8.3 (this sprint ships correctly-linked stub pages so the site structure is complete, but the legal content itself is out of scope here).
- Payment processing infrastructure for Buy Me A Coffee — this is an external link/embed to an existing third-party service, not a payment feature this codebase builds or maintains.

## Risks

- **Sequencing risk with `Design.md`'s rewrite.** If the full cross-product Design System rewrite (referenced across several sprints, e.g., §6 of `Sprint 7.3`) hasn't landed as its own explicit deliverable by this point, Marketing v2 risks being built against a design language that then shifts. Recommendation: treat the Design System rewrite as a prerequisite check before starting this sprint's visual work, not a parallel-track assumption — flagged here since no earlier sprint in this roadmap explicitly owns "rewrite `Design.md` end to end" as a standalone deliverable; it's currently distributed across `Architecture-Review-Report.md §2`'s Admin note and this sprint's dependency list. If it hasn't happened by Sprint 8.1, add it as an explicit pre-step rather than absorbing design-system churn mid-sprint.
- **Domain finalization blocking multiple downstream items.** Flagged since Sprint 7.1; if not resolved by the start of this sprint, it blocks this sprint's DoD directly (not just adjacently, as before).

## Future Extensions

- Localized/translated marketing copy, if i18n content (not just i18n-ready infrastructure, per `PRD.md §5`) is ever prioritized post-launch.
- A/B testing on hero messaging, once real traffic volume makes it statistically meaningful — not useful pre-launch.
