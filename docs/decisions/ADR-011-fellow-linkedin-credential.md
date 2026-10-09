# ADR-011: Fellow on LinkedIn — feed share now, no "Add to profile" credential

- **Status:** Accepted for option B. Option A is **blocked pending an issuer-policy decision**.
- **Date:** 2026-10-10
- **Builds on:** Growth R3 (achievement celebrations). Plan: `tasks/plan-r4-finish-partial.md`, task A5.

## Context

The growth audit (2026-10-05) listed "Add PM Fellow to LinkedIn" as a missing mechanism: the full-curriculum certificate has a one-click LinkedIn "Add to profile" link (`lib/certificates/linkedin-url.ts`), and Fellow, the product's top status, has nothing comparable.

A LinkedIn "Add to profile" entry is a **Licenses & certifications** item. It names an issuing organisation and implies a verifiable credential. PM Fellow is an admin-granted distinction based on portfolio readiness and review. It is not an assessed credential, and there is no public verification page for it the way `/verify/[code]` exists for certificates.

Since Growth R1, the code has followed a hard rule: the Fellow experience never links to `linkedin.com/profile/add` and is never called a certificate or credential. Tests enforce it in the celebration modal, the notification copy and the share button.

## Options

| Option | What it is | Status |
|---|---|---|
| A. LinkedIn "Add to profile" certification for Fellow | Reuse `buildLinkedInCertificationUrl` with a Fellow name and issuer | **Blocked.** It claims a credential. It needs a written issuer policy (what Fellow certifies, who verifies it, revocation, a public verification page) from product and legal. |
| B. LinkedIn **feed share** of the learner's portfolio, with Fellow wording where we control the text | `ShareButton context="fellow"` | **Accepted.** No credential claim. LinkedIn's share-offsite intent takes only a URL, so the post card comes from the portfolio page's OG tags, which already show the Fellow badge. The X and native-share text reads "I was selected as a PM Fellow at Prodily PM Academy. Here is my Product Management portfolio:". |
| C. Downloadable Fellow badge image for manual posting | A static or generated asset | Deferred. It needs design work and has low expected reach. |

## Decision

Ship option B on owner-only surfaces:
- the Fellow celebration, now;
- the dashboard, once it shows Fellow status (R4 A6).

The first-person wording is never used on the public portfolio page, because visitors use that page's share control too.

Option A stays out until the policy questions below are answered. The tests that ban `profile/add`, "certif" and "credential" in Fellow output stay in place until then. They are the guard, and lifting them is part of accepting option A.

## Open questions for option A (policy owner: product, with legal review)

1. What does Fellow attest to, and is that stable enough to call a credential?
2. Who is the issuer of record, and does the LinkedIn organisation page match it?
3. Is there a public verification URL per Fellow, and what does it show after a revoke?
4. Does a revoked Fellow's LinkedIn entry need to be addressed (we cannot remove it)?

## Consequences

- Fellows get a one-tap share at the moment of grant. Measure it with `portfolio_share_clicked {platform}` plus `achievement_celebration_cta_clicked {kind: 'fellow', action: 'share_portfolio'}`.
- No credential claim reaches LinkedIn, so there is no revocation or verification debt.
- If option A is accepted later, it is additive: a new CTA, and the guard tests change to allow the specific credential link.
