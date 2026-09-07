# Automatic Portfolio Verification — Operating Guide

**Location:** Learner-facing status on `/p/[username]` and Settings → Portfolio; admin control in `/admin/users/[id]`
**Workspace:** User Detail Drawer (not a moderation queue)
**Audience:** Platform Administrators

> **Not to be confused with PM Fellow Designation** — a separate, manually-admin-granted credential covered in [`docs/admin/fellow-designation.md`](fellow-designation.md). Both happen to use the word "verification"/"verified" in the UI; they share no code, no database column, and no admin queue. A portfolio can be Verified without being Fellow, and vice versa.

---

## 1. Purpose

Unlike PM Fellow, Portfolio Verification is **automatic by default** — no admin action is required. A portfolio becomes Verified the moment its owner's profile meets a fixed completeness bar, computed live on every read. An admin can override the automatic result (force-verify or force-reject) for a specific user, but this is the exception, not the normal path.

---

## 2. Automatic Eligibility Rule

A portfolio is auto-verified when **all** of the following are true (`calculatePortfolioVerification()` in `lib/portfolio-readiness.ts`):
- Profile has an **avatar** image.
- Profile has a **bio** (reuses the same "has bio" signal as the Portfolio Readiness checklist).
- At least **2 of 3** professional links are present: LinkedIn, GitHub, personal website.

This deliberately reuses the same avatar/bio completeness signals as the existing "Ready to Share" readiness checklist rather than re-deriving them — the one materially stricter requirement is the **≥2 links** threshold (readiness only requires ≥1 link, and doesn't require an avatar at all).

There is **no request or approval step** — verification status simply reflects the current state of the profile, recomputed on every portfolio/settings page load.

---

## 3. Where It's Shown

- **Public portfolio** (`/p/[username]`): `PortfolioHero.tsx` renders a `BadgeCheck` icon next to the learner's name, `title="Verified Portfolio"`, when `isPortfolioVerified` is true. This is visually and conceptually distinct from the separate "Product Management Fellow" badge/pill.
- **Learner settings** (Settings → Portfolio): `PortfolioVerificationCard` shows the current status and exactly which of the three criteria are/aren't met, so the learner can self-serve their way to verification.

---

## 4. Admin Override

Located in the **User Detail Drawer** (`/admin/users/[id]`), rendered as `UserPortfolioVerificationToggle` directly below the PM Fellow toggle — **not** in any moderation queue, and not tied to a public-portfolio invariant the way Fellow is.

Three actions:
- **Verify** — force `portfolio_verification_override = 'verified'`. Overrides automatic eligibility (even if the profile doesn't actually meet the bar).
- **Reject** — force `portfolio_verification_override = 'rejected'`. Overrides automatic eligibility even if the profile does meet the bar.
- **Reset to Auto** — clears the override (`null`), returning to live automatic computation. Only shown when an override is currently active.

Backend: `POST /api/admin/users/[id]/portfolio-verification` → `AdminConsoleService.setPortfolioVerificationOverride()`, which writes the nullable `users.portfolio_verification_override` column (`'verified' | 'rejected' | null`) and revalidates `/p/[username]`, `/api/og/portfolio/[username]`, `/admin/users`, `/admin/moderation`, `/admin/portfolios`. Audit actions logged: `set_portfolio_verification_verified`, `set_portfolio_verification_rejected`, `reset_portfolio_verification`.

**Precedence:** admin override (if set) always wins over the automatic computation. `null` = automatic eligibility applies (the default source of truth for the vast majority of users, who will never have an override set).

---

## 5. Practical Example

**A learner asks why their portfolio isn't showing as Verified:**
1. Open `/admin/users`, search for the learner, open their detail drawer.
2. Check the Portfolio Verification control's current state — if "Automatic," check their Settings → Portfolio page (or ask them) which of avatar / bio / 2-of-3-links is missing.
3. If they've genuinely met the bar but something's stuck, or if you want to grant an exception, click **Verify** to force it.
4. If you need to walk it back later, click **Reset to Auto** rather than leaving a stale manual override in place.
