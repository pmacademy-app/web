# In-App Notifications & Platform Announcements — Operating Guide

**Location:** `/admin/communications?tab=notifications` (or `/admin/notifications`) & `/admin/announcements`  
**Workspace:** Operations $\rightarrow$ Communications / Notifications  
**Audience:** Administrators & Community Managers  

---

## 1. Purpose

The In-App Notifications workspace enables administrators to send real-time in-app messages to segmented learner audiences, manage in-app notification templates, and publish platform-wide banner announcements.

---

## 2. Access & Permissions

- **Path:** Navigate to `/admin/communications?tab=notifications` or `/admin/announcements`.
- **Permissions:** Admin role required (`is_admin = true` or listed in `ADMIN_EMAILS`).

---

## 3. Operational Procedures

### A. Creating & Executing an In-App Broadcast
1. Navigate to `/admin/communications?tab=notifications`.
2. Click **[ New In-App Broadcast ]**.
3. **Configure the Broadcast:**
   - **Notification Title:** Short, compelling headline (e.g., *"Sprint Review is Live!"*).
   - **Notification Body:** Message text explaining the update.
   - **Action URL:** Optional destination path (e.g., `/academy/strategy/strat-101`).
   - **Category:** `system`, `learning`, `achievement`, or `reminder`.
   - **Audience Targeting:** `All Users`, `Active Learners (last 7 days)`, or `Cohort Members`.
4. **Recipient Estimation:** Click **Estimate Recipients** to verify audience size and sample recipients.
5. **Dispatch:**
   - Click **Execute Now** to immediately insert notifications into `public.notifications` for all targeted learners.
   - Or click **Schedule** for future delivery.

### B. Pausing, Resuming & Canceling Broadcasts
In the In-App Broadcasts table:
- **Pause Campaign:** For running/scheduled campaigns, click **Pause** to suspend processing.
- **Resume Campaign:** Click **Resume** to restart processing.
- **Cancel Campaign:** Click **Cancel** to abort unsent batches.

### C. Publishing System Banner Announcements (`/admin/announcements`)
Banner announcements display a dismissable alert bar across the top of the entire application:
1. Navigate to `/admin/announcements` $\rightarrow$ click **[ Create Announcement ]**.
2. **Configure Banner:**
   - **Title & Message:** Text displayed in the banner.
   - **Severity:** `info` (blue), `warning` (amber), `critical` (red).
   - **Action Link:** Optional link button text and URL.
   - **Schedule Window:** Start time (`starts_at`) and Expiration time (`expires_at`).
3. Click **Publish Announcement**.
4. The banner becomes immediately visible to all active learners until dismissed or expired.

---

## 4. User Experience & Real-Time Effects

When an in-app notification is delivered:
- **Navbar Bell:** The notification bell icon in the top navigation immediately increments its unread badge count.
- **Popover Panel:** Clicking the bell opens the Notification Center popover (`components/notifications/NotificationCenterPopover.tsx`), displaying the new message with direct navigation links.
- **Delivery Audit:** The event is logged in `public.notification_delivery_events`.

---

## 5. Practical Example

**Alerting students about an upcoming live workshop:**
1. Open `/admin/communications?tab=notifications` $\rightarrow$ click **[ New In-App Broadcast ]**.
2. Title: *"Live PM Interview Workshop Tomorrow at 7 PM IST"*.
3. Body: *"Join our live product teardown session. Reserve your spot now."*
4. Action URL: `/dashboard`.
5. Audience: `All Users`.
6. Click **Execute Now**. All registered students immediately receive the notification in their top navbar.
