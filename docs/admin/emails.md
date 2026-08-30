# Outbound Email Operations & Broadcasts — Operating Guide

**Location:** `/admin/communications` (tabs: Queue, Broadcasts, Automations, Templates) & `/admin/users`  
**Workspace:** Operations $\rightarrow$ Communications / Emails  
**Audience:** Administrators & Community Managers  

---

## 1. Purpose

The Email Operations workspace provides full operational control over outbound email delivery, including transactional template management, live queue monitoring, dead-letter retry operations, multi-channel email broadcasts, and individual user email dispatches.

---

## 2. Access & Permissions

- **Path:** Navigate to `/admin/communications` from the sidebar (or use route alias `/admin/emails`).
- **Permissions:** Admin role required (`is_admin = true` or listed in `ADMIN_EMAILS`).

---

## 3. Email Operational Procedures

### A. Monitoring the Email Queue & Retrying Failed Emails
1. Navigate to `/admin/communications?tab=queue`.
2. Inspect the **Queue KPIs**: Pending Messages, Processing, Delivered, Failed.
3. Review the failed messages table. Each row displays the target email, template key, error message, and retry attempt count.
4. **Retry Individual Email:** Click the **[ Retry ]** button on a failed row.
5. **Bulk Retry:** Click **[ Retry All Failed ]** in the header to re-enqueue all failed messages whose attempts are under `max_attempts`.

### B. Creating & Scheduling an Email Broadcast
1. Navigate to `/admin/communications?tab=broadcasts`.
2. Click **[ New Broadcast ]** to open the campaign builder.
3. **Configure the Campaign:**
   - **Internal Campaign Title:** Internal reference name.
   - **Email Subject:** Outbound email subject line.
   - **Preview Text:** Subheader snippet shown in email clients.
   - **Audience Targeting:** Select `All Users`, `Inactive Users (>14 days)`, or `Active Cohort`.
4. **Estimate Audience:** Click **[ Estimate Recipients ]** to query `/api/admin/emails/broadcasts/recipient-count` and preview sample profiles.
5. **Dispatch Options:**
   - **Send Test:** Send a live draft to your admin email address first.
   - **Execute Now:** Immediately enqueue messages for all targeted recipients.
   - **Schedule for Later:** Select a future date and time for automated background dispatch.

### C. Testing & Editing Transactional Templates
1. Navigate to `/admin/communications?tab=templates`.
2. Select any template (e.g., `auth.welcome`, `curriculum.certificate_issued`, `reengagement.nudge`).
3. **Inspect Code & Variables:** View the React Email source code and supported template variables (e.g., `{{name}}`, `{{certificateCode}}`).
4. **Live Preview:** Inspect the rendered responsive HTML preview.
5. **Send Test Email:** Click **[ Send Test Email ]** in the top action bar. Enter your test email address and click **Send**. The template is rendered with mock data and sent directly via Resend.

### D. Sending a Direct Production Email to a Specific Learner
1. Navigate to `/admin/users` and open the student's **User Detail Drawer**.
2. Switch to the **Communications Tab**.
3. Click the green **[ Send Production Email ]** button.
4. Select the desired template from the dropdown.
5. Review the target user's email and name.
6. Click **Confirm & Send**. The message is immediately queued and processed for delivery.

---

## 4. Platform Quotas & Rate Limits

Outbound emails adhere to rate limits configured in `/admin/settings?section=email`:
- **Daily Send Limit (`dailySendLimit`):** Default `1000` emails/day.
- **Hourly Send Limit (`hourlySendLimit`):** Default `100` emails/hour.
- **Max Retry Attempts (`maxRetryAttempts`):** Default `3` attempts before marking as permanently failed.
- **Critical Auth Exemption:** Verification emails and password resets bypass daily automation quotas.

---

## 5. Warnings & Best Practices

> [!WARNING]
> **Live Email Dispatch:** Broadcasts and direct production sends deliver real emails to actual recipients. Always verify the audience preview and send a test draft to yourself before triggering a campaign.

> [!IMPORTANT]
> **Email Unsubscribes:** The broadcast engine automatically respects student unsubscribes (`unsubscribed_at`) and suppression lists. Never manually bypass suppression records for marketing campaigns.

---

## 6. Practical Example

**Executing an Academy Announcement Campaign:**
1. Go to `/admin/communications?tab=broadcasts` $\rightarrow$ click **[ New Broadcast ]**.
2. Enter Subject: *"New Product Strategy Capstones are Now Live"*.
3. Target: `All Users`.
4. Click **Estimate Recipients** $\rightarrow$ confirm audience count (e.g., 240 learners).
5. Click **Send Test** to inspect the email in your own inbox.
6. Once verified, click **Execute Now**.
7. Monitor real-time delivery progress in `/admin/communications?tab=queue`.
