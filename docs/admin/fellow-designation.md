# PM Fellow Designation — Operating Guide

**Location:** `/admin/moderation?tab=portfolios` (legacy queue) and `/admin/moderation?tab=fellow-requests` (request queue), plus `/admin/users` (per-user toggle)
**Workspace:** Operations → Moderation
**Audience:** Platform Administrators & Lead Reviewers

> **Not to be confused with Portfolio Verification** — a separate, unrelated, automatic eligibility system covered in [`docs/admin/portfolio-verification.md`](portfolio-verification.md). Both happen to use the word "verification" in the UI; they share no code, no database column, and no admin control.

---

## 1. Purpose

**PM Fellow** (`users.is_fellow`) is a manually admin-granted credential shown on a learner's public portfolio ("Product Management Fellow at Prodily"). There are currently **two independent paths** to grant it, both of which write to the same `is_fellow` column via the same underlying service (`AdminConsoleService.toggleUserFellowStatus`):

1. **Learner-initiated request queue** (`fellow_requests` table) — a learner requests Fellow status once eligible; an admin reviews and approves/rejects.
2. **Legacy admin-browse queue** — an admin browses all public portfolios directly and grants/revokes Fellow at their own discretion, independent of any request.

Both paths existed side-by-side in the codebase as of this writing, with no deprecation marker on either — treat that as a live product question if you're deciding whether one should eventually replace the other.

---

## 2. Access & Permissions

- **Path A (requests):** `/admin/moderation` → **Fellow Requests** tab.
- **Path B (legacy browse):** `/admin/moderation` → **Portfolio Verification** tab (`?tab=portfolios`). `/admin/portfolios` redirects here.
- **Path C (direct toggle):** `/admin/users/[id]` → `UserFellowToggle` in the User Detail Drawer.
- **Permissions:** Admin role required (`is_admin = true` or listed in `ADMIN_EMAILS`) for all three.

---

## 3. Verification Semantics & Credibility Standards

### What "Fellow" Means
> *Prodily administrators have reviewed this candidate's public portfolio, case studies, and applied PM deliverables, confirming they meet Prodily's quality standards and designating them as a **Product Management Fellow at Prodily**.*

### What "Fellow" Does NOT Mean
- It does **NOT** imply employment at Prodily (strictly no `worksFor: Prodily` in Schema.org JSON-LD or UI).
- It does **NOT** guarantee employment or recruiter endorsement.
- It does **NOT** represent formal fellowship cohort enrollment.

### Public Portfolio Invariant
- **Only public portfolios can be granted Fellow status**, via either path. If a user's portfolio is private (`is_portfolio_public = false`), the backend rejects the grant with `HTTP 400 Bad Request: "Cannot verify a private portfolio. The user portfolio must be public."`

---

## 4. Path A — Learner-Initiated Fellow Requests

1. A learner reaches full Portfolio Readiness (**every** item — essential and recommended — complete: display name, username, public visibility, bio, ≥1 published capstone, avatar, ≥1 professional link). This is a stricter bar than the "ready to share" checklist, which only requires the essential items.
2. `FellowRequestCard.tsx` (Settings) shows a **Request PM Fellow** button once eligible.
3. `POST /api/fellow-requests` re-verifies eligibility server-side and inserts a `fellow_requests` row with `status: 'pending'`. A partial unique index prevents duplicate pending requests per user.
4. **Admin review** — open `/admin/moderation?tab=fellow-requests`:
   - Inspect the candidate's portfolio and submitted capstones.
   - **Approve:** calls the same `toggleUserFellowStatus` used by the legacy queue, sets `is_fellow = true`, and sends the learner an in-app notification.
   - **Reject:** records an optional rejection reason, surfaced to the learner; they can re-request once eligibility is regained (rejection doesn't require full re-eligibility from scratch, just meeting the bar again).

---

## 5. Path B — Legacy Admin-Browse Queue

1. **Open the queue:** `/admin/moderation?tab=portfolios`.
2. **Filter by Pending:** the **Pending Review** tab shows all public portfolios awaiting review (this queue is *not* limited to learners who requested it — it's every public portfolio).
3. **Inspect the Portfolio:** click **[ Open ↗ ]** to view the candidate's live public portfolio (`/p/[username]`) in a new tab. Review their case studies for sound problem framing, discovery, metrics, and PRD reasoning.
4. **Grant:** click **`[ Verify ]`** — shows a loading state, dispatches the update, and displays a success toast (*"Verified [Name] as a PM Fellow"*). The row updates to **`[ Verified Fellow ✓ ]`** without a page refresh.
5. **Revoke:** from the **Verified Fellows** or **All Public** tab, click **`[ Unverify ]`**, confirm the dialog (*"Revoke PM Fellow verification for [Name]?"*). Status reverts to `Pending Review`.

### Queue Metrics
- **Pending Verification (Amber):** public portfolios not yet Fellow.
- **Verified Fellows (Emerald):** public portfolios with `is_fellow = true`.
- **Total Public Portfolios (Blue):** all public portfolios on the platform.

---

## 6. Path C — Direct Toggle in the User Detail Drawer

`UserFellowToggle` (rendered above the tabs in the drawer, always visible regardless of active tab — not confined to a specific tab) lets an admin grant/revoke Fellow for one specific user directly, bypassing either queue. Same `is_fellow` write, same public-portfolio invariant.

---

## 7. System Effects & Cache Invalidation (all three paths)

1. **Database Update:** `users.is_fellow` updated via service-role client.
2. **Cache Purge:** `/p/[username]`, `/api/og/portfolio/[username]`, `/admin/moderation`, `/admin/users`, `/admin/portfolios`.
3. **Audit Log:** recorded in `public.admin_audit_logs` with admin email and timestamp.
4. **Public Portfolio Updates:** the candidate's live portfolio instantly renders the "Product Management Fellow" badge, updated `<title>`, and dynamic OG card.
5. **Path A only:** the learner also receives an in-app notification of the approval/rejection outcome. Paths B and C do not currently notify the learner.
