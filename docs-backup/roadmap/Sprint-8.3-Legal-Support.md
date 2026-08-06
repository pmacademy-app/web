# Sprint 8.3 — Legal & Support

**Phase:** 4 (Public Launch Preparation) · **Depends on:** Sprint 8.1 (stub Privacy/Terms pages must exist to receive real content). · **Blocks:** Sprint 8.6 (Public Launch QA checks legal pages are live, not stubs).
**Companion docs:** `../product/Brand-Architecture.md §2` (legal entity naming — `Prodigy`), `../architecture/Architecture.md §9` (Google Analytics privacy configuration this sprint verifies).

---

## Goal

Replace stub Privacy/Terms pages with real legal content, and stand up a genuine support/contact channel — not a dead-end form.

## Deliverables

1. Privacy Policy content, naming `Prodigy` as the data controller (per `Brand-Architecture.md §2`), covering: what's collected (per `Architecture.md §2`'s actual data model — auth, progress, XP events, reflections, etc.), Google Analytics usage (with the IP-anonymization configuration already required by `Architecture.md §9`), Resend's role as email processor, and user rights (access/deletion — the Delete Account flow from Sprint 7.2 is the operational mechanism this policy should reference).
2. Terms of Service content, referring to `PM Academy` as "the Service" per `Brand-Architecture.md §2`'s convention, covering the free-forever commitment (Product Principle #2, `PRD.md §1`) as an explicit contractual statement, not just marketing copy.
3. Support/contact flow: a real destination (email address or lightweight ticketing) reachable from the marketing site footer and from within the app (e.g., Settings).
4. Google Analytics configuration audit: confirm IP anonymization and minimal-PII configuration match what `Architecture.md §9` already requires — this sprint verifies an existing requirement, doesn't introduce a new one.

## UI Changes

- Privacy and Terms pages populated with real content (routes already exist as stubs from Sprint 8.1).
- A support/contact entry point added to the marketing footer and to Settings (a natural fit — see `Sprint 7.2`'s Settings 2.0 IA, though this sprint doesn't need to modify that sprint's code, just add a link).

## Backend Changes

- Minimal — if support is implemented as a simple form-to-email rather than a ticketing system (recommended, consistent with `Rules.md §2`'s "boring technology, free-tier discipline" principle — no need for a paid helpdesk tool at launch scale), this is a small API route using the existing Resend integration, not a new email provider.

## Database Changes

None expected, unless the support flow needs a lightweight `support_requests` table for tracking (optional — a form-to-email approach needs no table at all, consistent with keeping this sprint minimal).

## API Impact

- Optional new route: `POST /api/support` if a form-to-email flow is built. If support is just a `mailto:` link, no API surface is needed at all — **prefer the simpler option** per the same free-tier/simplicity discipline applied throughout this roadmap (`Product-Review-Report.md`'s test: does this duplicate capability Resend already gives us? A `mailto:` link or a Resend-backed form both avoid a new service; pick whichever is less code, not whichever looks more polished).

## Testing Checklist

- [ ] Privacy Policy accurately reflects the actual data model (`Architecture.md §2`) — cross-checked line-by-line against the real schema, not written generically.
- [ ] Terms of Service explicitly states the free-forever commitment in a way a skeptical visitor (the exact audience `PRD.md §8` calls out) would find credible and specific, not boilerplate.
- [ ] Support contact is reachable from both the marketing site and within the authenticated app.
- [ ] A test support submission (if a form was built) is actually received and actionable, not silently dropped.
- [ ] Google Analytics configuration verified as IP-anonymized in the live production configuration, not just the code that intends it.

## Definition of Done

- Privacy and Terms pages are live, real, and linked from the footer/signup flow.
- Support has a working destination.
- **This document does not constitute legal advice** — the content produced here is a structural and factual-accuracy pass (matching the actual product's data practices), not a substitute for a founder-driven or professionally reviewed legal pass before this is treated as launch-ready. Flagged explicitly in `Roadmap.md`'s Gaps section as an item needing founder/legal sign-off beyond what documentation work alone can close.

## Out of Scope

- Formal legal review by an attorney — outside this documentation/architecture engagement's scope; flagged as a founder action item.
- Cookie-consent banner infrastructure, unless the founder's jurisdiction/user base requires it — not assumed by default; a judgment call that depends on the finalized launch geography, noted here rather than silently decided either way.

## Risks

- **Treating this sprint's output as legally sufficient without review.** The single biggest risk in this sprint is scope-creep in the opposite direction — over-trusting a documentation pass for something that has real legal consequences. Explicitly flagged, not silently assumed away.

## Future Extensions

- Ticketing system upgrade if support volume outgrows a simple form-to-email flow post-launch.
- Region-specific legal addenda (e.g., GDPR-specific language) if/when the user base composition makes it clearly necessary.
