# Unified Communications & Messaging Hub — Operating Guide

**Location:** `/admin/communications`  
**Workspace:** Operations $\rightarrow$ Communications  
**Audience:** Administrators, Support Engineers & Marketing Leads  

---

## 1. Purpose

The Unified Communications Workspace consolidates all student messaging channels into one operational control center: outbound email queues, broadcast campaigns, cron automation triggers, transactional template management, in-app notification broadcasts, and inbound student support inquiries.

---

## 2. Access & Permissions

- **Path:** Navigate to `/admin/communications` from the sidebar.
- **Route Aliases:** `/admin/emails`, `/admin/notifications`, and `/admin/templates` automatically redirect to their respective tabs in this workspace.
- **Permissions:** Admin role required (`is_admin = true` or listed in `ADMIN_EMAILS`).

---

## 3. Communications Tabs & Capabilities

### Tab 1: Overview (`?tab=overview`)
High-level operational metrics across all communication pipelines:
- Delivery success rates, total emails queued/delivered, active broadcasts, and Resend provider status.

### Tab 2: Email Queue (`?tab=queue`)
Real-time inspection of asynchronous outgoing emails:
- View status (`pending`, `processing`, `delivered`, `failed`), error logs, and attempt counts.
- **Individual Retry:** Click **[ Retry ]** on any failed email.
- **Bulk Retry:** Click **[ Retry All Failed ]** in the header.

### Tab 3: Email Broadcasts (`?tab=broadcasts`)
Targeted email campaign manager:
- Draft, schedule, estimate audience sizes, test, execute, and cancel mass email campaigns.
- *Refer to the [Email Operations Guide](emails.md) for full procedures.*

### Tab 4: Automations (`?tab=automations`)
Inspection and manual execution of scheduled cron digest workflows:
- **Daily Reminders:** Morning streak and flashcard review alerts.
- **Weekly Recaps:** Monday morning learner progress summaries.
- **[ Run Now ] Button:** Manually triggers immediate execution of an automation workflow without waiting for the scheduled cron window.

### Tab 5: Templates (`?tab=templates`)
Transactional React Email registry:
- Inspect template source code and supported variable tokens.
- Live responsive HTML preview.
- **[ Send Test Email ] Button:** Dispatches a live test email with sample data to your admin email address.

### Tab 6: In-App Notifications (`?tab=notifications`)
Multi-channel in-app notification manager:
- Compose and dispatch targeted in-app broadcasts directly to learner notification centers.
- *Refer to the [In-App Notifications Guide](notifications.md) for full procedures.*

### Tab 7: Contact Inquiries (`?tab=contact`)
Inbound student support inquiry inbox:
- View messages submitted via the public `/contact` form.
- Filter by category (`curriculum`, `technical`, `account`, `enterprise`, `other`).
- Update inquiry status: `new` $\rightarrow$ `in_progress` $\rightarrow$ `resolved` $\rightarrow$ `archived`.
- Inspect student contact email, subject line, message text, and submission timestamp.

---

## 4. Practical Example

**Handling an inbound support message:**
1. Open `/admin/communications?tab=contact`.
2. Click on a message in the `new` status list.
3. Review the student's question and email address.
4. If the question requires looking at the student's account:
   - Copy their email address.
   - Open `/admin/users` in a new tab and search for their account.
5. Once responded, return to `/admin/communications?tab=contact` and update the status to **`resolved`**.
