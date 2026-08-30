# Content Moderation & Quality Review — Operating Guide

**Location:** `/admin/moderation`  
**Workspace:** Operations $\rightarrow$ Moderation  
**Audience:** Administrators & Content Reviewers  

---

## 1. Purpose

The Moderation Workspace is the centralized review center for all learner-submitted content across Prodily PM Academy: student testimonials, product feedback, module capstone deliverables, and public portfolio verifications.

---

## 2. Access & Permissions

- **Path:** Navigate to `/admin/moderation` from the sidebar.
- **Permissions:** Admin role required (`is_admin = true` or listed in `ADMIN_EMAILS`).

---

## 3. Moderation Tabs & Operational Procedures

### A. Testimonials Moderation (`?tab=testimonials`)
Review student reviews submitted upon completing courses or milestones:
1. Open the **Testimonials** tab.
2. Review learner quotes, star ratings (1–5), author names, and avatar photos.
3. **Approve / Publish:** Click **[ Publish ]** (or **Approve**). The testimonial status transitions to `published` and immediately appears on the public landing page.
4. **Reject / Archive:** Click **[ Reject ]**. The status transitions to `rejected` and is excluded from marketing sections.

### B. Product Feedback Review (`?tab=feedback`)
Inspect qualitative student feedback, bug reports, and suggestions:
1. Open the **Product Feedback** tab.
2. Filter feedback by category (`curriculum`, `platform`, `feature_request`, `general`).
3. Read student commentary and user metadata to identify product improvements.

### C. Capstone Deliverables Review (`?tab=capstones`)
Review student case study deliverables produced at the end of curriculum modules:
1. Open the **Capstones** tab.
2. Inspect the submitted deliverable text, module context, word count, and candidate retrospective.
3. **Review & Approve:** Click **[ Mark Reviewed ]**.
4. **Toggle Public Portfolio Visibility:** Toggle the **Public / Private** switch to control whether this deliverable can be showcased on the learner's public portfolio.

### D. Portfolio Verification Queue (`?tab=portfolios`)
Review candidate public portfolios and grant/revoke **Product Management Fellow** designation.
*For full step-by-step procedures, refer to the [Portfolio Verification Operating Guide](portfolio-verification.md).*

---

## 4. System Effects

- **Marketing Page Sync:** Publishing a testimonial automatically updates the landing page testimonials carousel.
- **Portfolio Showcase:** Marking a capstone as public permits the learner to pin it as a featured case study on their public portfolio.
- **Audit Logging:** All moderation decisions (approve, publish, reject, toggle) are permanently recorded in `public.admin_audit_logs`.
