# User Management & Profile Administration — Operating Guide

**Location:** `/admin/users`  
**Workspace:** Operations $\rightarrow$ Users  
**Audience:** Administrators & Operations Leads  

---

## 1. Purpose

The Users workspace allows administrators to search, inspect, troubleshoot, and manage all registered learners across Prodily PM Academy. It provides deep visibility into individual learning progress, activity timelines, earned credentials, communications history, and administrative account controls.

---

## 2. Access & Permissions

- **Path:** Navigate to `/admin/users` from the sidebar.
- **Permissions:** Admin role required (`is_admin = true` or listed in `ADMIN_EMAILS`).
- **Direct User Links:** Any user can be directly opened using `/admin/users?userId=<UUID>`.

---

## 3. How to Find & Inspect a User

1. **Search:** Enter the user's name, email address, or `@username` handle into the search bar at the top of the table. Search is debounced and queries the database dynamically.
2. **Filter:** Use the filter pills to narrow down users:
   - **Role:** All, Admins Only, Learners Only.
   - **Verification:** All, Verified Email, Unverified Email.
   - **Status:** Active (logged in past 30 days), Stalled, Inactive.
3. **Open User Detail Drawer:** Click on any user row in the table. On desktop, this slides open the full-height **User Detail Drawer** on the right side of the screen. On mobile, it navigates to `/admin/users/[id]`.

---

## 4. User Detail Drawer Tabs & Metadata

### Tab 1: Overview
- **Goal:** Learner's selected career objective (e.g., *"Transition into Product Management"*).
- **Progress Summary:** Course completion percentage bar, total completed lessons, quiz attempts, and earned badges count.
- **Recent Activity:** Last 5 learning events with timestamps.
- **Latest Credentials:** Most recently earned badge and certificate.
- **Public Portfolio:** Status badge (`Public` or `Private`) with direct `[ Open portfolio ↗ ]` link.

### Tab 2: Learning
- **Course Progress:** Lessons completed (`completed / 90`), total quiz attempts, average quiz pass score (%), and SRS flashcard review count.
- **Module Progress Breakdown:** Lists all 9 curriculum modules with progress bars and lesson counts.
- **Reset Module Progress Action:** For modules with progress, an amber **[ Reset Module ]** button allows resetting progress for just that specific module without affecting other modules.

### Tab 3: Activity
- Complete chronological audit timeline of all learning actions (theory reads, quiz passes, flashcard reviews, streak check-ins, capstone submissions).

### Tab 4: Achievements
- **Badges:** Grid of all unlocked achievement badges with earn dates and descriptions.
- **Certificates:** Registry of issued certificates with certificate code, type, and issuance date.
- **Capstones:** Submitted module case studies with review status (`submitted`, `reviewed`, `rejected`) and public visibility state (`Public` vs `Private`).

### Tab 5: Communications
- **Sent Emails:** History of all transactional and broadcast emails dispatched to this learner.
- **In-App Notifications:** History of in-app notifications with read/unread status.
- **Contact Inquiries:** Past support messages submitted via the `/contact` form.
- **[ Send Production Email ] Button:** Opens the production email dispatch modal to send a live transactional template directly to this learner.

### Tab 6: Account
- Raw account metadata: Email address, Email Verification status (`Verified` vs `Unverified`), Signup Date, Last Active Date, Account Status (`Admin` vs `Learner`), Auth Provider (`email`, `google`, etc.), Timezone, and System UUID.

---

## 5. Administrative Actions & Controls

### A. Role Management (`UserRoleToggle`)
- **Action:** Toggle between **Learner** and **Admin**.
- **Effect:** Immediately updates `users.is_admin` in PostgreSQL.
- **Warning:** Granting Admin gives the user unrestricted access to all admin workspaces, settings, and user data.

### B. Fellow Designation (`UserFellowToggle`)
- **Action:** Toggle **Product Management Fellow** designation (`is_fellow`).
- **Effect:** Updates `users.is_fellow = true`. Immediately updates the learner's public portfolio hero badge, SEO title, OpenGraph preview card, and Person structured data.
- **Invariant:** Requires the learner's portfolio to be public.

### C. Developer QA Actions (`DeveloperActionsSection`)
- **Generate Test Certificate:** Triggers the complete certificate issuance, PDF generation, notification dispatch, and email queue pipeline for QA verification. Bypasses curriculum completion prerequisites.

### D. Direct Email Dispatch (`SendProductionEmailModal`)
- Located in the **Communications Tab**.
- Allows selecting an approved transactional template (e.g., `auth.welcome`, `curriculum.certificate_issued`, `reengagement.nudge`), previewing variables, and immediately queuing it for delivery to this specific user.

### E. Destructive Actions

#### 1. Reset All User Progress
- **Location:** Footer of the User Detail Drawer $\rightarrow$ **[ Reset Progress ]**.
- **Effect:** Deletes all rows in `user_lesson_progress`, `user_reflections`, `user_streaks`, `user_badges`, and `xp_events` for this user. Sets `total_xp = 0` and `level = 1`.
- **Confirmation:** Requires confirming the prompt dialog. Cannot be undone.

#### 2. Delete User Account
- **Location:** Footer of the User Detail Drawer $\rightarrow$ **[ Delete Account ]**.
- **Effect:** Permanently deletes the user record from `auth.users` and cascades through all related tables in PostgreSQL.
- **Confirmation:** Requires typing or confirming the deletion dialog. **Permanently irreversible.**

---

## 6. Practical Examples

### Scenario A: A student asks why their lesson progress was locked
1. Open `/admin/users` and search by their email address.
2. Click their row to open the **User Detail Drawer**.
3. Go to the **Learning Tab**. Check which module has stalled lessons.
4. If the learner encountered a corrupted quiz state, click **[ Reset Module ]** for that module so they can retry cleanly.

### Scenario B: Resending an unconfirmed verification email
1. Search for the unverified user.
2. In the **Account Tab**, verify `Verification: Unverified`.
3. Go to the **Communications Tab** $\rightarrow$ click **[ Send Production Email ]**.
4. Select `auth.verify_email` and click **Send**. The verification email is immediately dispatched.
