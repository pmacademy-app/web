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
- **Route Aliases:** `/admin/emails` (→ `?tab=queue`), `/admin/notifications` (→ `?tab=in-app`, internally remapped from a "notifications" alias), `/admin/templates`, and `/admin/announcements` (→ `?tab=announcements`) automatically redirect into this workspace.
- **Permissions:** Admin role required (`is_admin = true` or listed in `ADMIN_EMAILS`).

---

## 3. Communications Tabs & Capabilities

The hub currently has **11** tab entries (`app/admin/(console)/communications/page.tsx`) — more than earlier versions of this guide listed:

```
overview, broadcasts, announcements, in-app, email, automations, templates, queue, contact, testimonials (→ /admin/moderation), feedback (→ /admin/moderation)
```

### Tab: Overview (`?tab=overview`)
High-level operational metrics across all communication pipelines: delivery success rates, total emails queued/delivered, active broadcasts, and provider status.

### Tab: Email (`?tab=email`)
Email history and volume series — distinct from the Queue tab below (this is closer to a reporting view; Queue is the operational retry surface).

### Tab: Email Queue (`?tab=queue`)
Real-time inspection of asynchronous outgoing emails:
- View status (`pending`, `processing`, `delivered`, `retrying`, `dead_letter`, `suppressed`, `skipped`), error logs, and attempt counts.
- **Individual Retry:** Click **[ Retry ]** on any failed email.
- **Bulk Retry:** Click **[ Retry All Failed ]** in the header.

### Tab: Email Broadcasts (`?tab=broadcasts`)
Targeted email campaign manager:
- Draft, schedule, estimate audience sizes, test, execute, and cancel mass email campaigns.
- *Refer to the [Email Operations Guide](emails.md) for full procedures.*

### Tab: Announcements (`?tab=announcements`)
Platform-wide dismissable banner announcements — merged into this hub from the formerly-standalone `/admin/announcements` page. Severity: `info`, `warning`, `critical`. Configurable start/expiry window.

### Tab: Automations (`?tab=automations`)
Inspection and manual execution of scheduled cron digest workflows:
- **Daily Reminders:** Morning streak and flashcard review alerts.
- **Weekly Recaps:** Monday morning learner progress summaries.
- **[ Run Now ] Button:** Manually triggers immediate execution of an automation workflow without waiting for the scheduled cron window.

### Tab: Templates (`?tab=templates`)
Transactional email template registry — plain HTML editor (no WYSIWYG), shared variable catalog with click-to-insert and unknown-variable validation, sandboxed live preview, draft/publish versioning. Admins can also create brand-new custom HTML templates from scratch (sanitized server-side). *See [`docs/EMAIL_SYSTEM.md`](../EMAIL_SYSTEM.md) §7 for the full variable-system architecture.*

### Tab: In-App Notifications (`?tab=in-app`)
Multi-channel in-app notification manager:
- Compose and dispatch targeted in-app broadcasts directly to learner notification centers.
- *Refer to the [In-App Notifications Guide](notifications.md) for full procedures.*

### Tab: Contact Inquiries (`?tab=contact`)
Inbound student support inquiry inbox:
- View messages submitted via the public `/contact` form (`public.contact_messages`).
- Filter by category (`curriculum`, `technical`, `account`, `enterprise`, `other`).
- Update inquiry status: `new` $\rightarrow$ `in_progress` $\rightarrow$ `resolved` $\rightarrow$ `archived`.
- Inspect student contact email, subject line, message text, and submission timestamp.

### Tabs: Testimonials / Feedback (`?tab=testimonials` / `?tab=feedback`)
Cross-links that route into the Moderation workspace rather than genuine Communications-hub content — see [`docs/admin/moderation.md`](moderation.md).

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
