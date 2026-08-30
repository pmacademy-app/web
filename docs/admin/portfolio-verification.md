# Portfolio Verification & Fellow Designation — Operating Guide

**Location:** `/admin/moderation?tab=portfolios`  
**Workspace:** Operations $\rightarrow$ Moderation $\rightarrow$ Portfolio Verification  
**Audience:** Platform Administrators & Lead Reviewers  

---

## 1. Purpose

The Portfolio Verification Queue is the dedicated workspace where administrators review public student portfolios, evaluate applied Product Management case studies, and grant or revoke **Product Management Fellow** designation (`is_fellow`).

---

## 2. Access & Permissions

- **Path:** Navigate to `/admin/moderation` $\rightarrow$ select the **Portfolio Verification** tab.
- **Route Alias:** `/admin/portfolios` automatically redirects to this workspace.
- **Permissions:** Admin role required (`is_admin = true` or listed in `ADMIN_EMAILS`).

---

## 3. Verification Semantics & Credibility Standards

### What "Verified" Means
> *Prodily administrators have reviewed this candidate's public portfolio, case studies, and applied PM deliverables, confirming they meet Prodily's quality standards and designating them as a **Product Management Fellow at Prodily**.*

### What "Verified" Does NOT Mean
- It does **NOT** imply employment at Prodily (strictly no `worksFor: Prodily` in Schema.org JSON-LD or UI).
- It does **NOT** guarantee employment or recruiter endorsement.
- It does **NOT** represent formal Phase 2 fellowship cohort enrollment.

### Public Portfolio Invariant
- **Only public portfolios can be verified.**
- If a user's portfolio is private (`is_portfolio_public = false`), they are excluded from the verification queue.
- Direct API attempts to verify a private portfolio are rejected by the backend with `HTTP 400 Bad Request: "Cannot verify a private portfolio. The user portfolio must be public."`.

---

## 4. How to Review & Verify a Portfolio

1. **Open the Verification Queue:** Go to `/admin/moderation?tab=portfolios`.
2. **Filter by Pending:** Select the **Pending Review** tab to view all public portfolios awaiting review.
3. **Inspect the Portfolio:** Click the **[ Open ↗ ]** button on the candidate's row. This opens their live public portfolio (`/p/[username]`) in a new tab.
4. **Evaluate Case Studies:**
   - Read the candidate's pinned/submitted capstone deliverables.
   - Check if problem framing, customer discovery, metrics, and PRD reasoning are sound.
5. **Grant Verification:**
   - Return to the Admin tab.
   - Click the green **`[ Verify ]`** button on the candidate's row.
   - The button shows a loading spinner, dispatches the update, and displays an instant success toast notification (`"Verified [Name] as a PM Fellow"`).
   - The row immediately updates to **`[ Verified Fellow ✓ ]`** without refreshing the page.

---

## 5. How to Revoke Verification (Unverify)

1. Select the **Verified Fellows** or **All Public** tab.
2. Locate the candidate and click the **`[ Unverify ]`** button.
3. A confirmation dialog appears:
   > *"Revoke PM Fellow verification for [Name]?"*
4. Click **Confirm Revocation**.
5. The Fellow status is removed (`is_fellow = false`), cache is purged, and the row status reverts to **`Pending Review`**.

---

## 6. Fields, Controls & Queue Metrics

### Top KPI Metrics
- **Pending Verification (Amber):** Count of active public portfolios awaiting review (`is_portfolio_public && !is_fellow`).
- **Verified Fellows (Emerald):** Count of verified PM Fellows with public portfolios (`is_portfolio_public && is_fellow`).
- **Total Public Portfolios (Blue):** Total number of public portfolios on the platform.

### Table Columns & Actions
| Column | Description |
|---|---|
| **Learner & Handle** | Candidate avatar/initials, full name, `@username`, and bio snippet. |
| **Submitted Projects** | Number of submitted module capstones. |
| **Verification Status** | `Verified Fellow` (green check) or `Pending Review` (amber clock). |
| **Portfolio Link** | Direct `[ Open ↗ ]` link to `/p/[username]`. |
| **Verification Action** | In-line `[ Verify ]` or `[ Unverify ]` button. |

---

## 7. System Effects & Cache Invalidation

When an admin clicks **Verify** or **Unverify**:
1. **Database Update:** The backend updates `users.is_fellow` via service-role Supabase client.
2. **Cache Purge:** The backend immediately triggers Next.js path revalidations:
   - `/p/[username]` (Public Portfolio page)
   - `/api/og/portfolio/[username]` (Dynamic OpenGraph card)
   - `/admin/moderation` (Moderation workspace)
   - `/admin/users` (Users workspace)
3. **Audit Log:** The action is permanently recorded in `public.admin_audit_logs` with admin email and timestamp.
4. **Public Portfolio Updates:** The candidate's live portfolio instantly renders the `Product Management Fellow` badge, updated `<title>` tag, and dynamic OpenGraph card.
