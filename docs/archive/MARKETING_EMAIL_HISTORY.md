# Prodily Marketing Email History & Campaign Archive

This document serves as the authoritative internal historical record of all marketing email campaigns, re-engagement broadcasts, cohort outreach, and promotional communications sent for **Prodily** (**Prodily PM Academy**).

---

## Executive Summary & Historical Overview

Between **August 11, 2026** and **August 31, 2026**, Prodily executed six targeted email campaigns directed at registered learners, fellows, and inactive users. In addition, the platform maintains automated waitlist confirmations and a database-backed broadcast and transactional template infrastructure.

### Summary of Campaigns

| # | Campaign Name / Identifier | Folder / Source Path | Platform | Date(s) Sent | Target Audience | Recipient Count (Logged) | Status |
|---|---|---|---|---|---|---|---|
| **1** | `reengagement_aug_2026` | `apps/web/scripts/local-campaigns/reengagement_aug_2026/` | Resend | Aug 11, 2026 | Inactive registered users (split by 0 vs 1–5 completed lessons) | 33 sent (27 Audience A, 6 Audience B) | **Delivered** |
| **2** | `marketing_aug_2026` | `apps/web/scripts/local-campaigns/marketing_aug_2026/` | Resend | Aug 15, 2026 | Segmented by XP status (Batch 1: XP > 0; Batches 2 & 3: XP = 0) | 154 sent (18 Batch 1, 48 Batch 2, 88 Batch 3) | **Delivered** |
| **3** | `reengagement_did_you_become_pm_aug_2026` | `apps/web/scripts/local-campaigns/reengagement_did_you_become_pm_aug_2026/` | Resend | Aug 16, 2026 | All registered eligible learners (excluding internal/admin) | 135 sent | **Delivered** |
| **4** | `reengagement_pm_journey_aug_2026` | `apps/web/scripts/local-campaigns/reengagement_pm_journey_aug_2026/` | Resend | Aug 24–25, 2026 | All eligible learners partitioned into 3 deterministic batches | 121 sent (40 Batch 1, 41 Batch 2, 40 Batch 3) | **Delivered** |
| **5** | `pm_fellow_linkedin_aug_2026` (`fellow_linkedin_aug_2026`) | `apps/web/scripts/local-campaigns/fellow_linkedin_aug_2026/` | Resend | August 2026 | Active Product Management Fellows (`is_fellow = true`) in 5 batches | Prepared in codebase (`marketing.pm_fellow`) | **Configured / Scripted** |
| **6** | `portfolio_fellow_campaign_aug_2026` | `apps/web/scripts/local-campaigns/portfolio_fellow_campaign_aug_2026/` | Brevo & Resend | Aug 30–31, 2026 | Remaining eligible learners & Fellows (portfolio showcase) | 234 sent | **Delivered** |

---

## Infrastructure, Sending Architecture & Safety Controls

### 1. Delivery Providers
- **Resend API:** Primary provider for campaigns 1, 2, 3, 4, 5, and fallback for campaign 6. Outbound API endpoint: `https://api.resend.com/emails`.
- **Brevo API (formerly Sendinblue):** Primary SMTP relay provider configured for campaign 6 and platform failover. Outbound API endpoint: `https://api.brevo.com/v3/smtp/email`.

### 2. Sender Identities & Addresses
- **Default System Sender:** `Prodily <welcome@prodily.adityagangwani.me>` (Derived from `BRAND.emailFromName` and `BRAND.emailFromAddress` / `RESEND_FROM_EMAIL`).
- **Dedicated Campaign Sender (Campaign 6):** `Prodily <noreply@prodily.adityagangwani.me>` (`REQUIRED_FROM_EMAIL`).
- **Support / Inquiries:** `hello@prodily.adityagangwani.me`.
- **Sign-off Persona:**
  - Standard campaigns: `Team Prodily` / `The Prodily Team`.
  - Campaign 4 (`reengagement_pm_journey_aug_2026`): `Aditya Gangwani (Founder, Prodily)`.

### 3. Safety & Idempotency Architecture
- **Local Isolation:** Execution scripts reside under `apps/web/scripts/local-campaigns/` (isolated from public version control via `.gitignore`).
- **Real-Time Eligibility Queries:** Real-time pre-send verification queries against Supabase (`public.users`, `public.user_lesson_progress`, `public.xp_events`, and `public.user_notification_preferences`).
- **Deterministic Partitioning:** User cohorts are deterministically partitioned by `created_at` and `id` sorting to guarantee consistent batching across multi-day rollouts.
- **Suppression & Preference Checks:** Strict enforcement of unsubscribes (`user_notification_preferences.all_notifications = false`, `all_email = false`, `marketing_email = false`), `email_suppressions`, and auth metadata flags.
- **Two-Phase Confirmation Gate:** Interactive CLI confirmation gate requiring explicit operator confirmation (`yes` / `YES`) before production dispatch.
- **Idempotency Logs:** JSON / JSONL state persistence recording `userId`, `email`, `status`, `sentAt`, and provider IDs (`resendId` / Brevo `messageId`).

---

# Detailed Campaign Records

```
================================================================================
CAMPAIGN 1: reengagement_aug_2026
================================================================================
```

### Campaign Metadata
- **Campaign Name:** Prodily Re-engagement Campaign (August 2026)
- **Campaign Identifier:** `reengagement_aug_2026`
- **Source Folder:** `apps/web/scripts/local-campaigns/reengagement_aug_2026/`
- **Script Path:** `apps/web/scripts/local-campaigns/reengagement_aug_2026/send-reengagement-campaign.ts`
- **Log Path:** `apps/web/scripts/local-campaigns/reengagement_aug_2026/logs/campaign_sent_reengagement_aug_2026.json`
- **Platform:** Resend
- **Campaign Purpose:** Re-engage registered users who signed up for Prodily but have either not started (0 lessons) or made initial progress (1–5 lessons).
- **Campaign Type:** Segmented Lifecycle / Re-engagement Broadcast
- **Date Sent:** August 11, 2026 (`2026-08-11T17:54:11.508Z` to `2026-08-11T17:54:34.661Z`)
- **Sender Name:** Prodily
- **Sender Email:** `welcome@prodily.adityagangwani.me`
- **Reply-To Address:** `hello@prodily.adityagangwani.me` / sender address
- **Destination URL:** `https://prodily.adityagangwani.me/academy` (`${siteUrl}/academy`)
- **Unsubscribe URL:** `https://prodily.adityagangwani.me/settings?tab=notifications`
- **Number of Emails in Campaign:** 2 segmented variants (Audience A and Audience B)
- **Execution Strategy:** Sub-batches of 5 with 1000ms delay between sub-batches.
- **Logged Deliveries:** 33 successful dispatches (27 Audience A, 6 Audience B)

---

### Email 1.1 — Audience A (0 Completed Lessons)

**Campaign:** `reengagement_aug_2026`  
**Platform:** Resend  
**Sequence position:** Segment Variant A (0 Lessons Completed)  
**Date:** August 11, 2026 (`2026-08-11T17:54:11Z` – `2026-08-11T17:54:34Z`)  
**Audience:** Users with `0` completed lessons in `public.user_lesson_progress`  
**Sender:** Prodily <welcome@prodily.adityagangwani.me>  
**Subject:** `You signed up. Now let's get started 🚀`  
**Preview text:** `Your first Product Management lesson is waiting for you.`  
**CTA:** `Start Learning →`  
**Destination:** `https://prodily.adityagangwani.me/academy`  
**Status:** Delivered (27 recipients)  

#### Exact Email Content (Plain Text)

```text
Hey ${firstName},

You signed up for Prodily, but you haven't started your first lesson yet.

No worries — getting started is usually the hardest part.

PM Academy is built to help you learn Product Management step by step, without having to piece everything together from random videos, articles, and courses.

Take a few minutes today and start your first lesson.

Start Learning: ${ctaUrl}

And if you're not sure where to begin or there's something stopping you from getting started, just reply to this email. We'd love to hear from you.

We're still building Prodily, and your feedback genuinely helps us make it better.

— Team Prodily

Learn Product Management. Build your career.

Prodily PM Academy · 90 lessons. 9 modules. Free forever.
Manage Preferences / Unsubscribe: ${siteUrl}/settings?tab=notifications
```

#### HTML Source

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>You signed up. Now let's get started 🚀</title>
    <div style="display:none;font-size:1px;color:#333333;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
      Your first Product Management lesson is waiting for you.
    </div>
  </head>
  <body style="margin:0; padding:32px 16px; background-color:#FBFAF6; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#171A17; line-height:1.6;">
    <table role="presentation" width="100%" border="0" cellPadding="0" cellSpacing="0" style="width:100%; max-width:560px; margin:0 auto;">
      <!-- Header (matching Confirm Email Address design) -->
      <tr>
        <td style="padding-bottom:24px; text-align:left;">
          <table role="presentation" border="0" cellPadding="0" cellSpacing="0">
            <tr>
              <td style="vertical-align:middle; padding-right:12px;">
                <img src="${siteUrl}/brand/logo-mark.png" alt="Prodily" height="36" style="display:block; border:none; border-radius:6px; width:auto;" />
              </td>
              <td style="vertical-align:middle;">
                <span style="font-size:18px; font-weight:bold; color:#1F6B4E; letter-spacing:-0.02em; display:block; line-height:1.2;">Prodily</span>
                <span style="font-size:11px; font-weight:600; color:#70685A; text-transform:uppercase; letter-spacing:0.05em; display:block;">PM Academy</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Body Card -->
      <tr>
        <td style="background-color:#FFFFFF; border-radius:16px; padding:36px 32px; border:1px solid #DED8CB; box-shadow:0 2px 8px rgba(31, 107, 78, 0.04);">
          <p style="margin:0 0 16px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">Hey ${firstName},</p>
          <p style="margin:0 0 16px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">You signed up for Prodily, but you haven't started your first lesson yet.</p>
          <p style="margin:0 0 16px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">No worries — getting started is usually the hardest part.</p>
          <p style="margin:0 0 16px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">PM Academy is built to help you learn Product Management step by step, without having to piece everything together from random videos, articles, and courses.</p>
          <p style="margin:0 0 24px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">Take a few minutes today and start your first lesson.</p>
          
          <!-- CTA Button -->
          <div style="margin:28px 0;">
            <a href="${ctaUrl}" target="_blank" style="display:inline-block; background-color:#1F6B4E; color:#ffffff !important; font-weight:700; font-size:15px; padding:12px 24px; border-radius:8px; text-decoration:none; text-align:center;">Start Learning →</a>
          </div>

          <p style="margin:24px 0 16px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">And if you're not sure where to begin or there's something stopping you from getting started, just reply to this email. We'd love to hear from you.</p>
          <p style="margin:0 0 16px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">We're still building Prodily, and your feedback genuinely helps us make it better.</p>
          <p style="margin:0; font-size:15px; color:#2B2F2B; line-height:1.6;">— Team Prodily</p>
        </td>
      </tr>

      <!-- Footer (matching Confirm Email Address design) -->
      <tr>
        <td style="padding-top:28px; text-align:center; font-size:12px; color:#70685A; line-height:1.5;">
          <p style="margin:0 0 8px 0; font-weight:600; color:#171A17;">Prodily PM Academy · 90 lessons. 9 modules. Free forever.</p>
          <p style="margin:0 0 8px 0;">
            <a href="${siteUrl}/settings?tab=notifications" style="color:#1F6B4E; text-decoration:none; font-weight:600; margin-right:10px;">Manage Preferences</a>
            ·
            <a href="${siteUrl}/settings?tab=notifications" style="color:#70685A; text-decoration:underline; margin-left:10px;">Unsubscribe</a>
          </p>
          <p style="margin:12px 0 0 0; color:#9EA59D; font-size:11px;">© ${new Date().getFullYear()} Prodily PM Academy. All rights reserved.</p>
        </td>
      </tr>
    </table>
  </body>
</html>
```

---

### Email 1.2 — Audience B (1–5 Completed Lessons)

**Campaign:** `reengagement_aug_2026`  
**Platform:** Resend  
**Sequence position:** Segment Variant B (1–5 Lessons Completed)  
**Date:** August 11, 2026 (`2026-08-11T17:54:19Z` – `2026-08-11T17:54:26Z`)  
**Audience:** Users with between `1` and `5` completed lessons in `public.user_lesson_progress`  
**Sender:** Prodily <welcome@prodily.adityagangwani.me>  
**Subject:** `You're already started. Keep going 💪`  
**Preview text:** `Pick up where you left off in PM Academy.`  
**CTA:** `Continue Learning →`  
**Destination:** `https://prodily.adityagangwani.me/academy`  
**Status:** Delivered (6 recipients)  

#### Exact Email Content (Plain Text)

```text
Hey ${firstName},

You've already started your journey on Prodily — now let's keep it going.

You've completed ${completedCount} ${lessonNoun} so far, and there's a lot more waiting for you in PM Academy.

Each lesson builds on the previous one, so even a little progress every day can take you a long way.

Continue Learning: ${ctaUrl}

Got feedback, found something confusing, or have a topic you'd like us to cover?

Just reply to this email. We're building Prodily with learners, and we'd love to hear from you.

— Team Prodily

Learn Product Management. Build your career.

Prodily PM Academy · 90 lessons. 9 modules. Free forever.
Manage Preferences / Unsubscribe: ${siteUrl}/settings?tab=notifications
```

#### HTML Source

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>You're already started. Keep going 💪</title>
    <div style="display:none;font-size:1px;color:#333333;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
      Pick up where you left off in PM Academy.
    </div>
  </head>
  <body style="margin:0; padding:32px 16px; background-color:#FBFAF6; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#171A17; line-height:1.6;">
    <table role="presentation" width="100%" border="0" cellPadding="0" cellSpacing="0" style="width:100%; max-width:560px; margin:0 auto;">
      <!-- Header (matching Confirm Email Address design) -->
      <tr>
        <td style="padding-bottom:24px; text-align:left;">
          <table role="presentation" border="0" cellPadding="0" cellSpacing="0">
            <tr>
              <td style="vertical-align:middle; padding-right:12px;">
                <img src="${siteUrl}/brand/logo-mark.png" alt="Prodily" height="36" style="display:block; border:none; border-radius:6px; width:auto;" />
              </td>
              <td style="vertical-align:middle;">
                <span style="font-size:18px; font-weight:bold; color:#1F6B4E; letter-spacing:-0.02em; display:block; line-height:1.2;">Prodily</span>
                <span style="font-size:11px; font-weight:600; color:#70685A; text-transform:uppercase; letter-spacing:0.05em; display:block;">PM Academy</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Body Card -->
      <tr>
        <td style="background-color:#FFFFFF; border-radius:16px; padding:36px 32px; border:1px solid #DED8CB; box-shadow:0 2px 8px rgba(31, 107, 78, 0.04);">
          <p style="margin:0 0 16px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">Hey ${firstName},</p>
          <p style="margin:0 0 16px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">You've already started your journey on Prodily — now let's keep it going.</p>
          <p style="margin:0 0 16px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">You've completed <strong>${completedCount} ${lessonNoun}</strong> so far, and there's a lot more waiting for you in PM Academy.</p>
          <p style="margin:0 0 24px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">Each lesson builds on the previous one, so even a little progress every day can take you a long way.</p>
          
          <!-- CTA Button -->
          <div style="margin:28px 0;">
            <a href="${ctaUrl}" target="_blank" style="display:inline-block; background-color:#1F6B4E; color:#ffffff !important; font-weight:700; font-size:15px; padding:12px 24px; border-radius:8px; text-decoration:none; text-align:center;">Continue Learning →</a>
          </div>

          <p style="margin:24px 0 16px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">Got feedback, found something confusing, or have a topic you'd like us to cover?</p>
          <p style="margin:0 0 16px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">Just reply to this email. We're building Prodily with learners, and we'd love to hear from you.</p>
          <p style="margin:0; font-size:15px; color:#2B2F2B; line-height:1.6;">— Team Prodily</p>
        </td>
      </tr>

      <!-- Footer (matching Confirm Email Address design) -->
      <tr>
        <td style="padding-top:28px; text-align:center; font-size:12px; color:#70685A; line-height:1.5;">
          <p style="margin:0 0 8px 0; font-weight:600; color:#171A17;">Prodily PM Academy · 90 lessons. 9 modules. Free forever.</p>
          <p style="margin:0 0 8px 0;">
            <a href="${siteUrl}/settings?tab=notifications" style="color:#1F6B4E; text-decoration:none; font-weight:600; margin-right:10px;">Manage Preferences</a>
            ·
            <a href="${siteUrl}/settings?tab=notifications" style="color:#70685A; text-decoration:underline; margin-left:10px;">Unsubscribe</a>
          </p>
          <p style="margin:12px 0 0 0; color:#9EA59D; font-size:11px;">© ${new Date().getFullYear()} Prodily PM Academy. All rights reserved.</p>
        </td>
      </tr>
    </table>
  </body>
</html>
```

---

```
================================================================================
CAMPAIGN 2: marketing_aug_2026
================================================================================
```

### Campaign Metadata
- **Campaign Name:** Prodily Marketing Email Campaign (August 2026)
- **Campaign Identifier:** `marketing_aug_2026`
- **Source Folder:** `apps/web/scripts/local-campaigns/marketing_aug_2026/`
- **Script Path:** `apps/web/scripts/local-campaigns/marketing_aug_2026/send-marketing-campaign.ts`
- **Log Path:** `apps/web/scripts/local-campaigns/marketing_aug_2026/logs/campaign_sent_marketing_aug_2026.json`
- **Platform:** Resend
- **Campaign Purpose:** Re-engage both learners with accumulated XP (progress reinforcement) and zero-XP users (overcoming initial inertia with free course messaging).
- **Campaign Type:** Segmented Product Marketing / Momentum Campaign
- **Date Sent:** August 15, 2026 (`2026-08-15T14:33:59.373Z` to `2026-08-15T19:38:11.002Z`)
- **Sender Name:** Prodily
- **Sender Email:** `welcome@prodily.adityagangwani.me`
- **Destination URL:** `https://prodily.adityagangwani.me/academy` (`${siteUrl}/academy`)
- **Unsubscribe URL:** `https://prodily.adityagangwani.me/settings?tab=notifications`
- **Number of Emails in Campaign:** 2 distinct email templates (Batch 1 template vs Batches 2 & 3 template)
- **Batches Breakdown:**
  - **Batch 1 (XP > 0):** Sent on Aug 15, 2026, 14:33:59–14:34:09 UTC (18 users)
  - **Batch 2 (XP = 0, first half):** Sent on Aug 15, 2026, 14:35:30–14:36:00 UTC (48 users)
  - **Batch 3 (XP = 0, second half):** Sent on Aug 15, 2026, 19:37:41–19:38:11 UTC (88 users)
- **Logged Deliveries:** 154 successful dispatches

---

### Email 2.1 — Batch 1 (Learners with XP > 0)

**Campaign:** `marketing_aug_2026`  
**Platform:** Resend  
**Sequence position:** Segment Batch 1 (XP > 0)  
**Date:** August 15, 2026 (`2026-08-15T14:33:59Z` – `2026-08-15T14:34:09Z`)  
**Audience:** Users with `total XP > 0`  
**Sender:** Prodily <welcome@prodily.adityagangwani.me>  
**Subject:** `Your Prodily journey is already underway 🚀`  
**Preview text:** `You have already earned XP on Prodily — keep the momentum going.`  
**CTA:** `Continue Learning →`  
**Destination:** `https://prodily.adityagangwani.me/academy`  
**Status:** Delivered (18 recipients)  

#### Exact Email Content (Plain Text)

```text
Hi ${firstName},

You've already started your Product Management journey with Prodily — and you've earned XP along the way. 🚀

Now's a great time to keep that momentum going.

Prodily's PM Academy is designed to help you build practical Product Management skills through structured lessons, quizzes, XP, streaks, badges, and more.

Your progress is already there. Pick up where you left off and keep building.

Continue learning on Prodily: ${ctaUrl}

Keep learning. Keep building. Keep growing.

— Team Prodily

${BRAND.fullName} · ${BRAND.positioning}
Manage Preferences / Unsubscribe: ${siteUrl}/settings?tab=notifications
```

#### HTML Source

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Your Prodily journey is already underway 🚀</title>
    <div style="display:none;font-size:1px;color:#333333;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
      You have already earned XP on Prodily — keep the momentum going.
    </div>
  </head>
  <body style="margin:0; padding:32px 16px; background-color:#FBFAF6; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#171A17; line-height:1.6;">
    <table role="presentation" width="100%" border="0" cellPadding="0" cellSpacing="0" style="width:100%; max-width:560px; margin:0 auto;">

      <!-- Header -->
      <tr>
        <td style="padding-bottom:24px; text-align:left;">
          <table role="presentation" border="0" cellPadding="0" cellSpacing="0">
            <tr>
              <td style="vertical-align:middle; padding-right:12px;">
                <img src="${siteUrl}${BRAND.assets.logoMarkPng}" alt="${BRAND.company}" height="36" style="display:block; border:none; border-radius:6px; width:auto;" />
              </td>
              <td style="vertical-align:middle;">
                <span style="font-size:18px; font-weight:bold; color:#1F6B4E; letter-spacing:-0.02em; display:block; line-height:1.2;">${BRAND.company}</span>
                <span style="font-size:11px; font-weight:600; color:#70685A; text-transform:uppercase; letter-spacing:0.05em; display:block;">${BRAND.product}</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Body Card -->
      <tr>
        <td style="background-color:#FFFFFF; border-radius:16px; padding:36px 32px; border:1px solid #DED8CB; box-shadow:0 2px 8px rgba(31, 107, 78, 0.04);">
          <p style="margin:0 0 16px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">Hi ${firstName},</p>
          <p style="margin:0 0 16px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">You've already started your Product Management journey with Prodily — and you've earned XP along the way. 🚀</p>
          <p style="margin:0 0 16px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">Now's a great time to keep that momentum going.</p>
          <p style="margin:0 0 16px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">Prodily's PM Academy is designed to help you build practical Product Management skills through structured lessons, quizzes, XP, streaks, badges, and more.</p>
          <p style="margin:0 0 24px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">Your progress is already there. <strong>Pick up where you left off and keep building.</strong></p>

          <!-- CTA Button -->
          <div style="margin:28px 0;">
            <a href="${ctaUrl}" target="_blank" style="display:inline-block; background-color:#1F6B4E; color:#ffffff !important; font-weight:700; font-size:15px; padding:12px 24px; border-radius:8px; text-decoration:none; text-align:center;">Continue Learning →</a>
          </div>

          <p style="margin:0; font-size:15px; color:#2B2F2B; line-height:1.6;">Keep learning. Keep building. Keep growing.</p>
          <p style="margin:16px 0 0 0; font-size:15px; color:#2B2F2B; line-height:1.6;">— Team Prodily</p>
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="padding-top:28px; text-align:center; font-size:12px; color:#70685A; line-height:1.5;">
          <p style="margin:0 0 8px 0; font-weight:600; color:#171A17;">${BRAND.fullName} · ${BRAND.positioning}</p>
          <p style="margin:0 0 8px 0;">
            <a href="${siteUrl}/settings?tab=notifications" style="color:#1F6B4E; text-decoration:none; font-weight:600; margin-right:10px;">Manage Preferences</a>
            ·
            <a href="${siteUrl}/settings?tab=notifications" style="color:#70685A; text-decoration:underline; margin-left:10px;">Unsubscribe</a>
          </p>
          <p style="margin:12px 0 0 0; color:#9EA59D; font-size:11px;">© ${new Date().getFullYear()} ${BRAND.fullName}. All rights reserved.</p>
        </td>
      </tr>

    </table>
  </body>
</html>
```

---

### Email 2.2 — Batches 2 & 3 (Learners with XP = 0)

**Campaign:** `marketing_aug_2026`  
**Platform:** Resend  
**Sequence position:** Segment Batches 2 & 3 (Zero XP)  
**Date:** August 15, 2026 (`2026-08-15T14:35:30Z` and `2026-08-15T19:37:41Z`)  
**Audience:** Registered users with `total XP = 0` (split into first and second half by user ID)  
**Sender:** Prodily <welcome@prodily.adityagangwani.me>  
**Subject:** `Ready to start your Product Management journey? 🚀`  
**Preview text:** `Your first PM lesson is waiting — and the core course is completely free.`  
**CTA:** `Start Learning →`  
**Destination:** `https://prodily.adityagangwani.me/academy`  
**Status:** Delivered (136 recipients: 48 in Batch 2, 88 in Batch 3)  

#### Exact Email Content (Plain Text)

```text
Hi ${firstName},

You signed up for Prodily — now it's time to take the first step. 🚀

Prodily's PM Academy gives you a structured way to learn Product Management from the fundamentals, with practical lessons, quizzes, XP, streaks, badges, and more.

And the best part? The core Product Management course is completely free.

You can start learning today and build your PM knowledge one lesson at a time.

Start learning on Prodily: ${ctaUrl}

Your Product Management journey starts with the first lesson.

— Team Prodily

${BRAND.fullName} · ${BRAND.positioning}
Manage Preferences / Unsubscribe: ${siteUrl}/settings?tab=notifications
```

#### HTML Source

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Ready to start your Product Management journey? 🚀</title>
    <div style="display:none;font-size:1px;color:#333333;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
      Your first PM lesson is waiting — and the core course is completely free.
    </div>
  </head>
  <body style="margin:0; padding:32px 16px; background-color:#FBFAF6; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#171A17; line-height:1.6;">
    <table role="presentation" width="100%" border="0" cellPadding="0" cellSpacing="0" style="width:100%; max-width:560px; margin:0 auto;">

      <!-- Header -->
      <tr>
        <td style="padding-bottom:24px; text-align:left;">
          <table role="presentation" border="0" cellPadding="0" cellSpacing="0">
            <tr>
              <td style="vertical-align:middle; padding-right:12px;">
                <img src="${siteUrl}${BRAND.assets.logoMarkPng}" alt="${BRAND.company}" height="36" style="display:block; border:none; border-radius:6px; width:auto;" />
              </td>
              <td style="vertical-align:middle;">
                <span style="font-size:18px; font-weight:bold; color:#1F6B4E; letter-spacing:-0.02em; display:block; line-height:1.2;">${BRAND.company}</span>
                <span style="font-size:11px; font-weight:600; color:#70685A; text-transform:uppercase; letter-spacing:0.05em; display:block;">${BRAND.product}</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Body Card -->
      <tr>
        <td style="background-color:#FFFFFF; border-radius:16px; padding:36px 32px; border:1px solid #DED8CB; box-shadow:0 2px 8px rgba(31, 107, 78, 0.04);">
          <p style="margin:0 0 16px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">Hi ${firstName},</p>
          <p style="margin:0 0 16px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">You signed up for Prodily — now it's time to take the first step. 🚀</p>
          <p style="margin:0 0 16px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">Prodily's PM Academy gives you a structured way to learn Product Management from the fundamentals, with practical lessons, quizzes, XP, streaks, badges, and more.</p>
          <p style="margin:0 0 16px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">And the best part? <strong>The core Product Management course is completely free.</strong></p>
          <p style="margin:0 0 24px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">You can start learning today and build your PM knowledge one lesson at a time.</p>

          <!-- CTA Button -->
          <div style="margin:28px 0;">
            <a href="${ctaUrl}" target="_blank" style="display:inline-block; background-color:#1F6B4E; color:#ffffff !important; font-weight:700; font-size:15px; padding:12px 24px; border-radius:8px; text-decoration:none; text-align:center;">Start Learning →</a>
          </div>

          <p style="margin:0 0 16px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">Your Product Management journey starts with the first lesson.</p>
          <p style="margin:0; font-size:15px; color:#2B2F2B; line-height:1.6;">— Team Prodily</p>
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="padding-top:28px; text-align:center; font-size:12px; color:#70685A; line-height:1.5;">
          <p style="margin:0 0 8px 0; font-weight:600; color:#171A17;">${BRAND.fullName} · ${BRAND.positioning}</p>
          <p style="margin:0 0 8px 0;">
            <a href="${siteUrl}/settings?tab=notifications" style="color:#1F6B4E; text-decoration:none; font-weight:600; margin-right:10px;">Manage Preferences</a>
            ·
            <a href="${siteUrl}/settings?tab=notifications" style="color:#70685A; text-decoration:underline; margin-left:10px;">Unsubscribe</a>
          </p>
          <p style="margin:12px 0 0 0; color:#9EA59D; font-size:11px;">© ${new Date().getFullYear()} ${BRAND.fullName}. All rights reserved.</p>
        </td>
      </tr>

    </table>
  </body>
</html>
```

---

```
================================================================================
CAMPAIGN 3: reengagement_did_you_become_pm_aug_2026
================================================================================
```

### Campaign Metadata
- **Campaign Name:** Prodily Provocative Re-engagement Campaign (Campaign 3)
- **Campaign Identifier:** `reengagement_did_you_become_pm_aug_2026`
- **Source Folder:** `apps/web/scripts/local-campaigns/reengagement_did_you_become_pm_aug_2026/`
- **Script Path:** `apps/web/scripts/local-campaigns/reengagement_did_you_become_pm_aug_2026/send-reengagement-did-you-become-pm.ts`
- **Log Path:** `apps/web/scripts/local-campaigns/reengagement_did_you_become_pm_aug_2026/logs/campaign_sent_reengagement_did_you_become_pm_aug_2026.json`
- **Platform:** Resend
- **Campaign Purpose:** Direct, provocative re-engagement asking registered users whether they have taken tangible steps to become a Product Manager since signing up.
- **Campaign Type:** Direct Re-engagement / Unconventional Copy Campaign
- **Date Sent:** August 16, 2026 (`2026-08-16T22:21:01.431Z` to `2026-08-16T22:22:18.120Z`)
- **Sender Name:** Prodily
- **Sender Email:** `welcome@prodily.adityagangwani.me`
- **Destination URL:** `https://prodily.adityagangwani.me/academy` (`${siteUrl}/academy`)
- **Unsubscribe URL:** `https://prodily.adityagangwani.me/settings?tab=notifications`
- **Explicit Internal Exclusions:** `adityagangwaniexam@gmail.com`, `pmacademyapp@gmail.com`, `ryangomez9965@gmail.com`
- **Number of Emails in Campaign:** 1 email template
- **Logged Deliveries:** 135 successful dispatches

---

### Email 3.1 — Provocative Re-Engagement ("Did you actually become a PM?")

**Campaign:** `reengagement_did_you_become_pm_aug_2026`  
**Platform:** Resend  
**Sequence position:** 1 of 1  
**Date:** August 16, 2026 (`2026-08-16T22:21:01Z` – `2026-08-16T22:22:18Z`)  
**Audience:** All registered learners (excluding opted-out and explicit admin addresses)  
**Sender:** Prodily <welcome@prodily.adityagangwani.me>  
**Subject:** `You signed up. But did you actually become a PM?`  
**Preview text:** `Did you actually start becoming a better Product Manager? Start your first lesson today.`  
**CTA:** `→ Start Learning`  
**Destination:** `https://prodily.adityagangwani.me/academy`  
**Status:** Delivered (135 recipients)  

#### Exact Email Content (Plain Text)

```text
Hi ${firstName},

You signed up for Prodily.

But here's the uncomfortable question:

Did you actually start becoming a better Product Manager?

If the answer is no — that's okay.

Most people don't need another 50-hour course sitting on their to-do list.

They just need to start.

Prodily is built to help you learn Product Management one practical lesson at a time, without overwhelming you.

No deadlines.
No 3-hour lectures.
No complicated learning path.

Just open Prodily, pick a lesson, and start.

Your first step can take just a few minutes.

→ Start Learning: ${ctaUrl}

Maybe this time, don't just sign up.

Actually start.

— Team Prodily

${BRAND.fullName} · ${BRAND.positioning}
Manage Preferences / Unsubscribe: ${siteUrl}/settings?tab=notifications
```

#### HTML Source

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>You signed up. But did you actually become a PM?</title>
    <div style="display:none;font-size:1px;color:#333333;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
      Did you actually start becoming a better Product Manager? Start your first lesson today.
    </div>
  </head>
  <body style="margin:0; padding:32px 16px; background-color:#FBFAF6; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#171A17; line-height:1.6;">
    <table role="presentation" width="100%" border="0" cellPadding="0" cellSpacing="0" style="width:100%; max-width:560px; margin:0 auto;">

      <!-- Header -->
      <tr>
        <td style="padding-bottom:24px; text-align:left;">
          <table role="presentation" border="0" cellPadding="0" cellSpacing="0">
            <tr>
              <td style="vertical-align:middle; padding-right:12px;">
                <img src="${siteUrl}${BRAND.assets.logoMarkPng}" alt="${BRAND.company}" height="36" style="display:block; border:none; border-radius:6px; width:auto;" />
              </td>
              <td style="vertical-align:middle;">
                <span style="font-size:18px; font-weight:bold; color:#1F6B4E; letter-spacing:-0.02em; display:block; line-height:1.2;">${BRAND.company}</span>
                <span style="font-size:11px; font-weight:600; color:#70685A; text-transform:uppercase; letter-spacing:0.05em; display:block;">${BRAND.product}</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Body Card -->
      <tr>
        <td style="background-color:#FFFFFF; border-radius:16px; padding:36px 32px; border:1px solid #DED8CB; box-shadow:0 2px 8px rgba(31, 107, 78, 0.04);">
          <p style="margin:0 0 16px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">Hi ${firstName},</p>
          <p style="margin:0 0 16px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">You signed up for Prodily.</p>
          <p style="margin:0 0 16px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">But here's the uncomfortable question:</p>
          <p style="margin:0 0 16px 0; font-size:16px; font-weight:700; color:#171A17; line-height:1.5;">Did you actually start becoming a better Product Manager?</p>
          <p style="margin:0 0 16px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">If the answer is no — that's okay.</p>
          <p style="margin:0 0 16px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">Most people don't need another 50-hour course sitting on their to-do list.</p>
          <p style="margin:0 0 20px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">They just need to start.</p>
          <p style="margin:0 0 20px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">Prodily is built to help you learn Product Management <strong>one practical lesson at a time</strong>, without overwhelming you.</p>

          <p style="margin:0 0 20px 0; font-size:14px; color:#50574F; line-height:1.8; background-color:#F5F3ED; padding:12px 16px; border-radius:8px;">
            No deadlines.<br />
            No 3-hour lectures.<br />
            No complicated learning path.
          </p>

          <p style="margin:0 0 16px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">Just open Prodily, pick a lesson, and start.</p>
          <p style="margin:0 0 24px 0; font-size:15px; color:#2B2F2B; line-height:1.6;"><strong>Your first step can take just a few minutes.</strong></p>

          <!-- CTA Button -->
          <div style="margin:28px 0;">
            <a href="${ctaUrl}" target="_blank" style="display:inline-block; background-color:#1F6B4E; color:#ffffff !important; font-weight:700; font-size:15px; padding:12px 24px; border-radius:8px; text-decoration:none; text-align:center;">→ Start Learning</a>
          </div>

          <p style="margin:0 0 8px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">Maybe this time, don't just sign up.</p>
          <p style="margin:0 0 20px 0; font-size:15px; font-weight:700; color:#171A17; line-height:1.6;">Actually start.</p>
          <p style="margin:0; font-size:15px; color:#2B2F2B; line-height:1.6;">— Team Prodily</p>
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="padding-top:28px; text-align:center; font-size:12px; color:#70685A; line-height:1.5;">
          <p style="margin:0 0 8px 0; font-weight:600; color:#171A17;">${BRAND.fullName} · ${BRAND.positioning}</p>
          <p style="margin:0 0 8px 0;">
            <a href="${siteUrl}/settings?tab=notifications" style="color:#1F6B4E; text-decoration:none; font-weight:600; margin-right:10px;">Manage Preferences</a>
            ·
            <a href="${siteUrl}/settings?tab=notifications" style="color:#70685A; text-decoration:underline; margin-left:10px;">Unsubscribe</a>
          </p>
          <p style="margin:12px 0 0 0; color:#9EA59D; font-size:11px;">© ${new Date().getFullYear()} ${BRAND.fullName}. All rights reserved.</p>
        </td>
      </tr>

    </table>
  </body>
</html>
```

---

```
================================================================================
CAMPAIGN 4: reengagement_pm_journey_aug_2026
================================================================================
```

### Campaign Metadata
- **Campaign Name:** Prodily Re-engagement Founder Letter (August 2026)
- **Campaign Identifier:** `reengagement_pm_journey_aug_2026`
- **Source Folder:** `apps/web/scripts/local-campaigns/reengagement_pm_journey_aug_2026/`
- **Script Path:** `apps/web/scripts/local-campaigns/reengagement_pm_journey_aug_2026/send-reengagement-pm-journey.ts`
- **Log Path:** `apps/web/scripts/local-campaigns/reengagement_pm_journey_aug_2026/logs/campaign_sent_reengagement_pm_journey_aug_2026.json`
- **Platform:** Resend
- **Campaign Purpose:** Personal letter from founder Aditya Gangwani emphasizing low barrier to entry ("Just 10 minutes") to resume unfinished PM learning paths.
- **Campaign Type:** Founder Outreach / Personal Re-engagement Campaign
- **Date Sent:** August 24–25, 2026
- **Sender Name:** Prodily
- **Sender Email:** `welcome@prodily.adityagangwani.me`
- **Founder Sign-off & Website:** Aditya Gangwani (`https://adityagangwani.me/`)
- **Destination URL:** `https://prodily.adityagangwani.me/academy` (`${siteUrl}/academy`)
- **Unsubscribe URL:** `https://prodily.adityagangwani.me/settings?tab=notifications`
- **Explicit Internal Exclusions:** `adityagangwaniexam@gmail.com`, `pmacademyapp@gmail.com`, `ryangomez9965@gmail.com`
- **Number of Emails in Campaign:** 1 email template
- **Batch Breakdown:**
  - **Batch 1 (40 recipients):** Sent Aug 24, 2026, 02:26:04–02:26:25 UTC
  - **Batch 2 (41 recipients):** Sent Aug 24, 2026, 02:33:58–02:34:20 UTC
  - **Batch 3 (40 recipients):** Sent Aug 25, 2026, 18:42:44–18:43:15 UTC
- **Logged Deliveries:** 121 successful dispatches

---

### Email 4.1 — Founder Re-Engagement ("You left something unfinished")

**Campaign:** `reengagement_pm_journey_aug_2026`  
**Platform:** Resend  
**Sequence position:** 1 of 1 (Dispatched across 3 equal contiguous batches)  
**Date:** August 24–25, 2026  
**Audience:** All eligible learners  
**Sender:** Prodily <welcome@prodily.adityagangwani.me>  
**Subject:** `You left something unfinished`  
**Preview text:** `Your progress is still there. If you’ve got 10 minutes today, come back and pick up where you left off.`  
**CTA:** `Continue where you left off →`  
**Destination:** `https://prodily.adityagangwani.me/academy`  
**Status:** Delivered (121 recipients)  

#### Exact Email Content (Plain Text)

```text
Hey ${firstName},

You started learning PM with Prodily — and I noticed you haven’t been back in a while.

Your progress is still there.

If you’ve got 10 minutes today, come back and pick up where you left off. There’s always one more concept, lesson, or idea that can make you a better product manager.

Continue where you left off → ${ctaUrl}

No big commitment. Just 10 minutes.

— Aditya Gangwani (https://adityagangwani.me/)
Founder, Prodily

${BRAND.fullName} · ${BRAND.positioning}
Manage Preferences / Unsubscribe: ${siteUrl}/settings?tab=notifications
```

#### HTML Source

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>You left something unfinished</title>
    <div style="display:none;font-size:1px;color:#333333;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
      Your progress is still there. If you’ve got 10 minutes today, come back and pick up where you left off.
    </div>
  </head>
  <body style="margin:0; padding:32px 16px; background-color:#FBFAF6; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#171A17; line-height:1.6;">
    <table role="presentation" width="100%" border="0" cellPadding="0" cellSpacing="0" style="width:100%; max-width:560px; margin:0 auto;">

      <!-- Header -->
      <tr>
        <td style="padding-bottom:24px; text-align:left;">
          <table role="presentation" border="0" cellPadding="0" cellSpacing="0">
            <tr>
              <td style="vertical-align:middle; padding-right:12px;">
                <img src="${siteUrl}${BRAND.assets.logoMarkPng}" alt="${BRAND.company}" height="36" style="display:block; border:none; border-radius:6px; width:auto;" />
              </td>
              <td style="vertical-align:middle;">
                <span style="font-size:18px; font-weight:bold; color:#1F6B4E; letter-spacing:-0.02em; display:block; line-height:1.2;">${BRAND.company}</span>
                <span style="font-size:11px; font-weight:600; color:#70685A; text-transform:uppercase; letter-spacing:0.05em; display:block;">${BRAND.product}</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Body Card -->
      <tr>
        <td style="background-color:#FFFFFF; border-radius:16px; padding:36px 32px; border:1px solid #DED8CB; box-shadow:0 2px 8px rgba(31, 107, 78, 0.04);">
          <p style="margin:0 0 16px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">Hey ${firstName},</p>
          <p style="margin:0 0 16px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">You started learning PM with Prodily — and I noticed you haven’t been back in a while.</p>
          <p style="margin:0 0 16px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">Your progress is still there.</p>
          <p style="margin:0 0 20px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">If you’ve got 10 minutes today, come back and pick up where you left off. There’s always one more concept, lesson, or idea that can make you a better product manager.</p>

          <!-- CTA Button -->
          <div style="margin:28px 0;">
            <a href="${ctaUrl}" target="_blank" style="display:inline-block; background-color:#1F6B4E; color:#ffffff !important; font-weight:700; font-size:15px; padding:12px 24px; border-radius:8px; text-decoration:none; text-align:center;">Continue where you left off →</a>
          </div>

          <p style="margin:0 0 24px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">No big commitment. Just 10 minutes.</p>
          <p style="margin:0 0 4px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">— <a href="https://adityagangwani.me/" target="_blank" style="color:#171A17; text-decoration:underline; font-weight:600;">Aditya Gangwani</a></p>
          <p style="margin:0; font-size:14px; font-weight:600; color:#70685A; line-height:1.4;">Founder, Prodily</p>
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="padding-top:28px; text-align:center; font-size:12px; color:#70685A; line-height:1.5;">
          <p style="margin:0 0 8px 0; font-weight:600; color:#171A17;">${BRAND.fullName} · ${BRAND.positioning}</p>
          <p style="margin:0 0 8px 0;">
            <a href="${siteUrl}/settings?tab=notifications" style="color:#1F6B4E; text-decoration:none; font-weight:600; margin-right:10px;">Manage Preferences</a>
            ·
            <a href="${siteUrl}/settings?tab=notifications" style="color:#70685A; text-decoration:underline; margin-left:10px;">Unsubscribe</a>
          </p>
          <p style="margin:12px 0 0 0; color:#9EA59D; font-size:11px;">© ${new Date().getFullYear()} ${BRAND.fullName}. All rights reserved.</p>
        </td>
      </tr>

    </table>
  </body>
</html>
```

---

```
================================================================================
CAMPAIGN 5: fellow_linkedin_aug_2026
================================================================================
```

### Campaign Metadata
- **Campaign Name:** Product Management Fellow — LinkedIn Profile & Experience Campaign
- **Campaign Identifier:** `pm_fellow_linkedin_aug_2026`
- **Source Folder:** `apps/web/scripts/local-campaigns/fellow_linkedin_aug_2026/`
- **Script Path:** `apps/web/scripts/local-campaigns/fellow_linkedin_aug_2026/send-pm-fellow-campaign.ts`
- **Log Reference:** `campaign_pm_fellow_linkedin_aug_2026_log.jsonl`
- **Platform:** Resend (integrating with `email_queue` under event `marketing.pm_fellow`)
- **Campaign Purpose:** Celebrate learners who have achieved the Product Management Fellow designation (`is_fellow = true`) and provide copy/paste templates for LinkedIn Experience, Headline, and public posts.
- **Campaign Type:** Recognition / Credential Showcase / Growth Campaign
- **Date Configured:** August 2026
- **Sender Name:** Prodily
- **Sender Email:** `welcome@prodily.adityagangwani.me`
- **Audience Criteria:** `users.is_fellow = true`, `is_blocked = false`, excluding suppressions and unsubscribes.
- **Distribution Strategy:** 5 deterministic round-robin batches (`TOTAL_BATCHES = 5`).
- **Primary CTA URL:** `https://www.linkedin.com/in/me/`
- **Primary CTA Label:** `Update My LinkedIn Profile`
- **Number of Emails in Campaign:** 1 email template (featuring Experience, Headline, and Post templates)
- **Status:** Campaign Infrastructure & Template Scripted in Codebase

---

### Email 5.1 — Product Management Fellow: LinkedIn Recognition & Experience

**Campaign:** `pm_fellow_linkedin_aug_2026`  
**Platform:** Resend  
**Sequence position:** 1 of 1 (5-Batch distribution)  
**Date:** August 2026  
**Audience:** Product Management Fellows (`is_fellow = true`)  
**Sender:** Prodily <welcome@prodily.adityagangwani.me>  
**Subject:** `You did it — you're officially a Product Management Fellow`  
**Preview text:** `Congratulations on earning it — here's how to add it to your LinkedIn profile in a few minutes.`  
**CTA:** `Update My LinkedIn Profile →`  
**Destination:** `https://www.linkedin.com/in/me/`  
**Status:** Scripted & Verified in Project  

#### Exact Email Content (Plain Text)

```text
Prodily PM Academy

Congratulations on earning it — here's how to add it to your LinkedIn profile in a few minutes.

Hi ${firstName},

Congratulations on earning the Product Management Fellow designation at Prodily. This wasn't handed to you — it reflects real work, real judgment calls, and real growth over the course of the program. Take a minute to actually sit with that.

Now that it's official, there's a simple way to make sure it's part of your professional record, not just something you know about yourself: putting it on LinkedIn.

Here's what we'd suggest, in order of impact:

1. Add it to your Experience section
So it sits alongside the rest of your career history — not just a line item, but a real entry with what you actually did.

2. Add it to your headline
So it's the first thing people see when your profile comes up.

3. Post about the experience
A short, honest post about what the Fellowship involved, what stretched you, or what you'd tell someone starting it. Tag Prodily — we'd genuinely love to see it and celebrate it with you.

We've drafted some starting language below for all three, so this takes minutes, not an afternoon. Edit freely — your version will always be better than a template.

This is your win. We just want to make sure it's visible where it belongs.

CTA: Update My LinkedIn Profile ( https://www.linkedin.com/in/me/ )

Proud of you,
The Prodily Team

────────────────────────────────────────
LinkedIn Experience Example
Title: Product Management Fellow
Company: Prodily

Description:
Selected for Prodily's Product Management Fellowship, a hands-on program focused on [product strategy / roadmap execution / cross-functional collaboration — adjust to program specifics]. Worked on [brief project description] and developed practical experience in [1–2 specific skills].

(Make sure to personalize this based on what you actually did!)

────────────────────────────────────────
LinkedIn Headline Examples
• Product Management Fellow at Prodily
• Aspiring Product Manager | Prodily PM Fellow
• [Current Role/Title] | Product Management Fellow, Prodily

────────────────────────────────────────
LinkedIn Post Template
I just completed Prodily's Product Management Fellowship — and I wanted to share a bit about what that actually looked like.

Going in, I expected [expectation]. What I didn't expect was [honest, specific detail — a challenge, a shift in thinking, a skill you didn't know you needed].

Some of what stuck with me:
• [Specific thing learned or practiced]
• [Specific thing learned or practiced]
• [A moment or project that stood out]

Grateful to [mentors/cohort/program team] for the experience, and proud to now hold the Product Management Fellow designation at Prodily.

[Optional: what's next for you]

@Prodily #ProductManagement #ProdilyFellow

────────────────────────────────────────
Manage Preferences: ${appUrl}/settings?tab=notifications
Unsubscribe: ${unsubscribeUrl}
© ${new Date().getFullYear()} ${BRAND.fullName}. All rights reserved.
```

#### HTML Source

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${BRAND.fullName}</title>
    <div style="display:none;font-size:1px;color:#333333;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
      Congratulations on earning it — here's how to add it to your LinkedIn profile in a few minutes.
    </div>
  </head>
  <body style="margin:0;padding:32px 16px;background-color:#FBFAF6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#171A17;line-height:1.6;">
    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;margin:0 auto;">
      <!-- Header -->
      <tr>
        <td style="padding-bottom:24px;text-align:left;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0">
            <tr>
              <td style="vertical-align:middle;padding-right:12px;">
                <img src="${appUrl}${BRAND.assets.logoMarkPng}" alt="${BRAND.company}" height="36" style="display:block;border:none;border-radius:6px;width:auto;" />
              </td>
              <td style="vertical-align:middle;">
                <span style="font-size:18px;font-weight:bold;color:#1F6B4E;letter-spacing:-0.02em;display:block;">
                  ${BRAND.company}
                </span>
                <span style="font-size:11px;font-weight:600;color:#70685A;text-transform:uppercase;letter-spacing:0.05em;">
                  ${BRAND.product}
                </span>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Body Card -->
      <tr>
        <td style="background-color:#FFFFFF;border-radius:16px;padding:36px 32px;border:1px solid #DED8CB;box-shadow:0 2px 8px rgba(31,107,78,0.04);">
          <h2 style="font-size:20px;color:#171A17;margin-top:0;margin-bottom:16px;font-weight:700;line-height:1.3;">
            Hi ${firstName},
          </h2>

          <p style="font-size:14px;color:#3F3A33;line-height:1.6;margin:0 0 16px 0;">
            Congratulations on earning the <strong>Product Management Fellow</strong> designation at Prodily. This wasn't handed to you — it reflects real work, real judgment calls, and real growth over the course of the program. Take a minute to actually sit with that.
          </p>

          <p style="font-size:14px;color:#3F3A33;line-height:1.6;margin:0 0 20px 0;">
            Now that it's official, there's a simple way to make sure it's part of your professional record, not just something you know about yourself: putting it on LinkedIn.
          </p>

          <p style="font-size:14px;color:#171A17;font-weight:600;margin:0 0 12px 0;">
            Here's what we'd suggest, in order of impact:
          </p>

          <!-- Step 1 -->
          <div style="margin-bottom:14px;padding-left:12px;border-left:3px solid #1F6B4E;">
            <p style="font-size:14px;font-weight:700;color:#171A17;margin:0 0 4px 0;">
              1. Add it to your Experience section
            </p>
            <p style="font-size:13px;color:#70685A;margin:0;line-height:1.5;">
              So it sits alongside the rest of your career history — not just a line item, but a real entry with what you actually did.
            </p>
          </div>

          <!-- Step 2 -->
          <div style="margin-bottom:14px;padding-left:12px;border-left:3px solid #1F6B4E;">
            <p style="font-size:14px;font-weight:700;color:#171A17;margin:0 0 4px 0;">
              2. Add it to your headline
            </p>
            <p style="font-size:13px;color:#70685A;margin:0;line-height:1.5;">
              So it's the first thing people see when your profile comes up.
            </p>
          </div>

          <!-- Step 3 -->
          <div style="margin-bottom:20px;padding-left:12px;border-left:3px solid #1F6B4E;">
            <p style="font-size:14px;font-weight:700;color:#171A17;margin:0 0 4px 0;">
              3. Post about the experience
            </p>
            <p style="font-size:13px;color:#70685A;margin:0;line-height:1.5;">
              A short, honest post about what the Fellowship involved, what stretched you, or what you'd tell someone starting it. Tag Prodily — we'd genuinely love to see it and celebrate it with you.
            </p>
          </div>

          <p style="font-size:14px;color:#3F3A33;line-height:1.6;margin:0 0 16px 0;">
            We've drafted some starting language below for all three, so this takes minutes, not an afternoon. Edit freely — your version will always be better than a template.
          </p>

          <p style="font-size:14px;color:#3F3A33;line-height:1.6;margin:0 0 24px 0;">
            This is your win. We just want to make sure it's visible where it belongs.
          </p>

          <!-- CTA Button -->
          <div style="margin:24px 0 32px 0;text-align:center;">
            <a href="https://www.linkedin.com/in/me/" style="display:inline-block;background-color:#1F6B4E;color:#FFFFFF;font-size:14px;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:8px;box-shadow:0 1px 2px rgba(0,0,0,0.05);">
              Update My LinkedIn Profile &rarr;
            </a>
          </div>

          <p style="font-size:14px;color:#3F3A33;line-height:1.6;margin:0 0 28px 0;">
            Proud of you,<br />
            <strong>The Prodily Team</strong>
          </p>

          <!-- Examples Section -->
          <div style="border-top:1px solid #E6E1D6;padding-top:24px;margin-top:24px;">
            <h3 style="font-size:15px;color:#171A17;font-weight:700;margin:0 0 12px 0;">
              LinkedIn Experience Example
            </h3>
            <div style="background-color:#FBFAF6;border:1px solid #DED8CB;border-radius:10px;padding:16px;margin-bottom:20px;font-size:13px;color:#3F3A33;line-height:1.6;">
              <p style="margin:0 0 4px 0;"><strong>Title:</strong> Product Management Fellow</p>
              <p style="margin:0 0 10px 0;"><strong>Company:</strong> Prodily</p>
              <p style="margin:0 0 8px 0;"><strong>Description:</strong></p>
              <p style="margin:0;color:#575046;font-style:italic;">
                Selected for Prodily's Product Management Fellowship, a hands-on program focused on [product strategy / roadmap execution / cross-functional collaboration — adjust to program specifics]. Worked on [brief project description] and developed practical experience in [1–2 specific skills].
              </p>
              <p style="margin:8px 0 0 0;font-size:11px;color:#70685A;">
                (Make sure to personalize this based on what you actually did!)
              </p>
            </div>

            <h3 style="font-size:15px;color:#171A17;font-weight:700;margin:0 0 12px 0;">
              LinkedIn Headline Examples
            </h3>
            <div style="background-color:#FBFAF6;border:1px solid #DED8CB;border-radius:10px;padding:16px;margin-bottom:20px;font-size:13px;color:#3F3A33;line-height:1.6;">
              <p style="margin:0 0 6px 0;">&bull; Product Management Fellow at Prodily</p>
              <p style="margin:0 0 6px 0;">&bull; Aspiring Product Manager | Prodily PM Fellow</p>
              <p style="margin:0;">&bull; [Current Role/Title] | Product Management Fellow, Prodily</p>
            </div>

            <h3 style="font-size:15px;color:#171A17;font-weight:700;margin:0 0 12px 0;">
              LinkedIn Post Template
            </h3>
            <div style="background-color:#FBFAF6;border:1px solid #DED8CB;border-radius:10px;padding:16px;font-size:13px;color:#3F3A33;line-height:1.6;">
              <p style="margin:0 0 10px 0;">
                I just completed Prodily's Product Management Fellowship — and I wanted to share a bit about what that actually looked like.
              </p>
              <p style="margin:0 0 10px 0;">
                Going in, I expected [expectation]. What I didn't expect was [honest, specific detail — a challenge, a shift in thinking, a skill you didn't know you needed].
              </p>
              <p style="margin:0 0 6px 0;">Some of what stuck with me:</p>
              <p style="margin:0 0 4px 0;">&bull; [Specific thing learned or practiced]</p>
              <p style="margin:0 0 4px 0;">&bull; [Specific thing learned or practiced]</p>
              <p style="margin:0 0 10px 0;">&bull; [A moment or project that stood out]</p>
              <p style="margin:0 0 10px 0;">
                Grateful to [mentors/cohort/program team] for the experience, and proud to now hold the Product Management Fellow designation at Prodily.
              </p>
              <p style="margin:0 0 10px 0;color:#70685A;font-style:italic;">
                [Optional: what's next for you]
              </p>
              <p style="margin:0;color:#1F6B4E;font-weight:600;">
                @Prodily #ProductManagement #ProdilyFellow
              </p>
            </div>
          </div>
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="padding-top:28px;text-align:center;font-size:12px;color:#70685A;line-height:1.5;">
          <p style="margin:0 0 8px 0;font-weight:600;color:#171A17;">
            ${BRAND.fullName} · ${BRAND.positioning}
          </p>
          <p style="margin:0 0 8px 0;">
            <a href="${appUrl}/settings?tab=notifications" style="color:#1F6B4E;text-decoration:none;font-weight:600;margin-right:10px;">
              Manage Preferences
            </a>
            ·
            <a href="${unsubscribeUrl}" style="color:#70685A;text-decoration:underline;margin-left:10px;">
              Unsubscribe
            </a>
          </p>
          <p style="margin:12px 0 0 0;color:#9EA59D;font-size:11px;">
            &copy; ${new Date().getFullYear()} ${BRAND.fullName}. All rights reserved.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>
```

---

```
================================================================================
CAMPAIGN 6: portfolio_fellow_campaign_aug_2026
================================================================================
```

### Campaign Metadata
- **Campaign Name:** Product Management Fellow & Portfolio Showcase
- **Campaign Identifier:** `portfolio_fellow_campaign_aug_2026`
- **Source Folder:** `apps/web/scripts/local-campaigns/portfolio_fellow_campaign_aug_2026/`
- **Script Path:** `apps/web/scripts/local-campaigns/portfolio_fellow_campaign_aug_2026/send-portfolio-fellow-campaign.ts`
- **Log Path:** `apps/web/scripts/local-campaigns/portfolio_fellow_campaign_aug_2026/campaign_portfolio_fellow_campaign_aug_2026_log.jsonl`
- **Platform:** Brevo (Primary SMTP relay) & Resend (Initial batch & fallback)
- **Campaign Purpose:** Introduce the new public Product Management Portfolios (`/p/[username]`), explain customization in Settings, and reinforce the Product Management Fellow badge for verified Fellows.
- **Campaign Type:** Product Marketing / Feature Adoption / Portfolio Launch
- **Date Sent:** August 30–31, 2026
- **Sender Name:** Prodily
- **Sender Email:** `noreply@prodily.adityagangwani.me` (`REQUIRED_FROM_EMAIL`)
- **Primary CTA:** `View & Edit My Portfolio →`
- **Primary Destination URL:** `${appUrl}/settings?tab=portfolio`
- **Portfolio Destination URL:** `${appUrl}/p/${user.username}`
- **Unsubscribe URL:** `${appUrl}/settings?tab=notifications`
- **Number of Emails in Campaign:** 1 email template
- **Batch Breakdown in Log:**
  - Initial direct and test dispatches: August 30, 2026, 11:57:16–12:01:17 UTC via Resend
  - Single Brevo confirmation test: August 31, 2026, 10:11:15 UTC (`smtp-relay.mailin.fr`)
  - Batch A dispatches: August 31, 2026, 10:14:12–10:14:59 UTC via Brevo
  - Batch B dispatches: August 31, 2026, 10:15:14–10:18:46 UTC via Brevo
- **Logged Deliveries:** 234 successful dispatches

---

### Email 6.1 — Portfolio & Fellow Recognition ("Showcase your product journey")

**Campaign:** `portfolio_fellow_campaign_aug_2026`  
**Platform:** Brevo & Resend  
**Sequence position:** 1 of 1  
**Date:** August 30–31, 2026  
**Audience:** All eligible learners and Product Management Fellows  
**Sender:** Prodily <noreply@prodily.adityagangwani.me>  
**Subject:** `Showcase your product journey: Portfolio & Fellow recognition`  
**Preview text:** `Add your Prodily portfolio and Fellow designation to LinkedIn in a few minutes.`  
**CTA:** `View & Edit My Portfolio →`  
**Destination:** `${appUrl}/settings?tab=portfolio`  
**Status:** Delivered (234 recipients logged)  

#### Exact Email Content (Plain Text)

```text
Prodily PM Academy

Add your Prodily portfolio and Fellow designation to LinkedIn in a few minutes.

Hi ${user.firstName},

Building product judgment is hard work. Whether you are actively working through modules or refining applied capstones on Prodily, your progress represents practical, proof-of-work experience.

────────────────────────────────────────
🎓 Product Management Fellow Recognition
────────────────────────────────────────
If you have been designated as a Product Management Fellow at Prodily, make sure this milestone is visible across your professional record:

• Experience: Add "Product Management Fellow at Prodily" to your LinkedIn Experience section.
• Headline: Feature it in your LinkedIn headline (e.g., "Aspiring Product Manager | Prodily PM Fellow").
• Share & Tag: Share a post about what stretched you or what you built, and tag @Prodily so we can celebrate with you.

────────────────────────────────────────
💼 Your Public Prodily Portfolio
────────────────────────────────────────
Every Prodily member has a live, shareable Product Management Portfolio that showcases your applied capstones, skill radar breakdown, and earned credentials. For Fellows, your portfolio automatically displays the official Product Management Fellow verification check in your hero profile.

How to make the most of your portfolio:
1. View your portfolio: ${portfolioUrl}
2. Edit & customize: Go to Settings -> Portfolio (${settingsPortfolioUrl}) to update your bio and select featured capstones.
3. Copy your link: Use the "Share Portfolio" button on your page to copy your link.
4. Add to LinkedIn: Add your portfolio URL to your LinkedIn intro header or Featured section.

CTA: View & Edit My Portfolio ( ${settingsPortfolioUrl} )

Proud of your growth,
The Prodily Team

────────────────────────────────────────
Manage Preferences: ${appUrl}/settings?tab=notifications
Unsubscribe: ${unsubscribeUrl}
© ${new Date().getFullYear()} ${BRAND.fullName}. All rights reserved.
```

#### HTML Source

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${BRAND.fullName}</title>
    <div style="display:none;font-size:1px;color:#333333;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
      Add your Prodily portfolio and Fellow designation to LinkedIn in a few minutes.
    </div>
  </head>
  <body style="margin:0;padding:32px 16px;background-color:#FBFAF6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#171A17;line-height:1.6;">
    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;margin:0 auto;">
      <!-- Header -->
      <tr>
        <td style="padding-bottom:24px;text-align:left;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0">
            <tr>
              <td style="vertical-align:middle;padding-right:12px;">
                <img src="${appUrl}${BRAND.assets.logoMarkPng}" alt="${BRAND.company}" height="36" style="display:block;border:none;border-radius:6px;width:auto;" />
              </td>
              <td style="vertical-align:middle;">
                <span style="font-size:18px;font-weight:bold;color:#1F6B4E;letter-spacing:-0.02em;display:block;">
                  ${BRAND.company}
                </span>
                <span style="font-size:11px;font-weight:600;color:#70685A;text-transform:uppercase;letter-spacing:0.05em;">
                  ${BRAND.product}
                </span>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Body Card -->
      <tr>
        <td style="background-color:#FFFFFF;border-radius:16px;padding:36px 32px;border:1px solid #DED8CB;box-shadow:0 2px 8px rgba(31,107,78,0.04);">
          <h2 style="font-size:20px;color:#171A17;margin-top:0;margin-bottom:16px;font-weight:700;line-height:1.3;">
            Hi ${user.firstName},
          </h2>

          <p style="font-size:14px;color:#3F3A33;line-height:1.6;margin:0 0 16px 0;">
            Building product judgment is hard work. Whether you are actively working through modules or refining applied capstones on Prodily, your progress represents practical, proof-of-work experience.
          </p>

          <!-- Section 1: Fellowship Recognition -->
          <div style="background-color:#FBFAF6;border:1px solid #DED8CB;border-radius:10px;padding:16px;margin:20px 0;">
            <h3 style="font-size:15px;color:#171A17;font-weight:700;margin:0 0 8px 0;">
              🎓 Product Management Fellow Recognition
            </h3>
            <p style="font-size:13px;color:#575046;margin:0 0 10px 0;line-height:1.5;">
              If you have been designated as a <strong>Product Management Fellow at Prodily</strong>, make sure this milestone is visible across your professional record:
            </p>
            <ul style="margin:0;padding-left:20px;font-size:13px;color:#3F3A33;line-height:1.6;">
              <li style="margin-bottom:4px;"><strong>Experience:</strong> Add <em>Product Management Fellow at Prodily</em> to your LinkedIn Experience section.</li>
              <li style="margin-bottom:4px;"><strong>Headline:</strong> Feature it in your LinkedIn headline (e.g., <em>Aspiring Product Manager | Prodily PM Fellow</em>).</li>
              <li><strong>Share &amp; Tag:</strong> Share a post about what stretched you or what you built, and tag <strong>@Prodily</strong> so we can celebrate with you.</li>
            </ul>
          </div>

          <!-- Section 2: Prodily Portfolio -->
          <h3 style="font-size:16px;color:#171A17;font-weight:700;margin:24px 0 10px 0;">
            💼 Your Public Prodily Portfolio
          </h3>
          <p style="font-size:14px;color:#3F3A33;line-height:1.6;margin:0 0 12px 0;">
            Every Prodily member has a live, shareable Product Management Portfolio that showcases your applied capstones, skill radar breakdown, and earned credentials. For Fellows, your portfolio automatically displays the official <strong>Product Management Fellow</strong> verification check in your hero profile.
          </p>

          <!-- How-to Guide -->
          <div style="margin:16px 0 20px 0;padding-left:12px;border-left:3px solid #1F6B4E;">
            <p style="font-size:13px;color:#171A17;margin:0 0 6px 0;">
              <strong>1. View your portfolio:</strong> Open <a href="${portfolioUrl}" style="color:#1F6B4E;text-decoration:none;font-weight:600;">${appUrl}/p/${user.username}</a> to inspect your live page.
            </p>
            <p style="font-size:13px;color:#171A17;margin:0 0 6px 0;">
              <strong>2. Edit &amp; customize:</strong> Go to <a href="${settingsPortfolioUrl}" style="color:#1F6B4E;text-decoration:none;font-weight:600;">Settings &rarr; Portfolio</a> to update your bio, customize section visibility, and select featured capstones.
            </p>
            <p style="font-size:13px;color:#171A17;margin:0 0 6px 0;">
              <strong>3. Copy your link:</strong> Click the green <em>Share Portfolio</em> button on your page to copy your link.
            </p>
            <p style="font-size:13px;color:#171A17;margin:0;">
              <strong>4. Add to LinkedIn:</strong> Paste your portfolio link into your LinkedIn intro section or add it as a link in your <em>Featured</em> section.
            </p>
          </div>

          <!-- Primary CTA -->
          <div style="margin:28px 0 32px 0;text-align:center;">
            <a href="${settingsPortfolioUrl}" style="display:inline-block;background-color:#1F6B4E;color:#FFFFFF;font-size:14px;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:8px;box-shadow:0 1px 2px rgba(0,0,0,0.05);">
              View &amp; Edit My Portfolio &rarr;
            </a>
          </div>

          <p style="font-size:14px;color:#3F3A33;line-height:1.6;margin:0;">
            Proud of your growth,<br />
            <strong>The Prodily Team</strong>
          </p>
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="padding-top:28px;text-align:center;font-size:12px;color:#70685A;line-height:1.5;">
          <p style="margin:0 0 8px 0;font-weight:600;color:#171A17;">
            ${BRAND.fullName} · ${BRAND.positioning}
          </p>
          <p style="margin:0 0 8px 0;">
            <a href="${appUrl}/settings?tab=notifications" style="color:#1F6B4E;text-decoration:none;font-weight:600;margin-right:10px;">
              Manage Preferences
            </a>
            ·
            <a href="${unsubscribeUrl}" style="color:#70685A;text-decoration:underline;margin-left:10px;">
              Unsubscribe
            </a>
          </p>
          <p style="margin:12px 0 0 0;color:#9EA59D;font-size:11px;">
            &copy; ${new Date().getFullYear()} ${BRAND.fullName}. All rights reserved.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>
```

---

# Additional Marketing & Lifecycle Email Records

In addition to scheduled mass re-engagement scripts, the Prodily repository contains automated lifecycle and transactional marketing emails.

---

### Additional Email A — Waitlist Confirmation Email

- **Trigger:** Automatic upon submission of the `/waitlist` form (`apps/web/app/api/waitlist/route.ts`).
- **Function:** `sendWaitlistConfirmationEmail({ name, email })` (`apps/web/lib/email.ts`).
- **Platform:** Brevo / Resend.
- **Subject:** `You're on the PM Academy waitlist!`
- **Sender:** `Prodily <welcome@prodily.adityagangwani.me>`

#### Exact Email Content (Plain Text)

```text
Hi ${firstName},

You're on the list for PM Academy! We'll notify you as soon as early access opens.

Prodily PM Academy - 90 lessons. 9 modules. Free forever.
```

#### HTML Source

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #171A17; background-color: #FBFAF6; padding: 20px; }
      .container { max-width: 560px; margin: 0 auto; background: #ffffff; padding: 32px; border-radius: 12px; border: 1px solid #e5e5e5; }
      .logo { margin-bottom: 24px; }
      .footer { margin-top: 32px; font-size: 12px; color: #737373; border-top: 1px solid #f5f5f5; padding-top: 16px; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="logo">
        <img src="${BRAND.siteUrl}${BRAND.assets.logoFullPng}" alt="${BRAND.fullName}" width="192" height="48" style="display:block; max-width:192px; width:100%; height:auto;" />
      </div>
      <h2>You're on the list, ${firstName}!</h2>
      <p>Thank you for joining the ${BRAND.shortName} waitlist.</p>
      <p>We're building a structured, free 90-lesson Product Management curriculum designed to take you from foundational principles to portfolio-ready artifacts - completely free.</p>
      <p>We'll notify you as soon as early access opens.</p>
      <div class="footer">
        ${BRAND.fullName} - ${BRAND.positioning}<br>
        If you didn't sign up for this waitlist, you can safely ignore this email.
      </div>
    </div>
  </body>
</html>
```

---

### Additional Email B — Automated Welcome Email (`auth.welcome`)

- **Component:** `WelcomeEmail` (`apps/web/emails/templates/auth/Welcome.tsx`)
- **Template Key:** `auth.welcome`
- **Default Subject Line:** `Welcome to Prodily!`
- **CTA:** `Start Lesson 1` → `${appUrl}/dashboard`

#### Exact Email Content (Plain Text)

```text
Welcome to Prodily, ${userName}! 🎉

You've unlocked full access to a structured, 90-lesson product management curriculum designed to build real product judgment through daily habit learning.

Here is what awaits you:
• 9 Structured Modules — From PM foundations to product strategy & execution.
• Interactive Quizzes & Spaced Repetition — Retain core concepts.
• Real-World Capstones & Portfolio — Build verifiable PM project credentials.

Start Lesson 1: ${appUrl}/dashboard
```

---

### Additional Email C — Direct Admin Message (`admin.direct_message`)

- **Component:** `DirectMessageEmail` (`apps/web/emails/templates/admin/DirectMessage.tsx`)
- **Template Key:** `admin.direct_message`
- **Subject Line:** `{{subject}}`
- **Used by:** Admin user detail console (`/admin/users`), marketing campaign logging (`marketing.pm_fellow`, `marketing.portfolio_fellow`).

---

## Authoritative Template Key Registry

Registered in `apps/web/emails/index.ts`:

| Template Key | Component | Default Subject Line | Category |
|---|---|---|---|
| `auth.verify_email` | `VerifyEmail` | `Confirm your PM Academy email address` | Critical Auth |
| `auth.password_reset` | `PasswordReset` | `Reset your Prodily password` | Critical Auth |
| `admin.direct_message` | `DirectMessageEmail` | `{{subject}}` | Direct Admin |
| `auth.welcome` | `WelcomeEmail` | `Welcome to Prodily!` | Lifecycle Automation |
| `learning.module_complete` | `ModuleCompletedEmail` | `Module Complete: {{moduleName}}!` | Achievement Automation |
| `achievement.badge_earned` | `BadgeEarnedEmail` | `New Badge Unlocked: {{badgeName}}!` | Achievement Automation |
| `achievement.level_up` | `LevelUpEmail` | `Level Up Unlocked: Level {{newLevel}}!` | Achievement Automation |
| `achievement.certificate` | `CertificateEarned` | `Your Prodily Certificate is Ready!` | Achievement Automation |
| `achievement.portfolio_published` | `PortfolioPublished` | `Your Public Portfolio is Live!` | Feature Showcase |
| `learning.weekly_recap` | `WeeklyRecap` | `Your Week in Prodily` | Scheduled Digest |
| `learning.daily_reminder` | `DailyReminder` | `Keep your learning streak alive on PM Academy!` | Daily Automation |
| `inactive.resume_learning` | `WelcomeEmail` | `Resume your learning path on PM Academy` | Lifecycle Automation |
