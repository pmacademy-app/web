# Prodily Marketing Email History & Campaign Archive

This document serves as the authoritative internal historical record of all marketing email campaigns, re-engagement broadcasts, cohort outreach, and promotional communications sent for **Prodily** (**Prodily PM Academy**).

---

## Executive Summary & Historical Overview

Between **August 11, 2026** and **September 18, 2026**, Prodily executed twelve targeted email campaigns directed at registered learners, fellows, and inactive users. In addition, the platform maintains automated waitlist confirmations, a database-backed broadcast scheduler, and transactional template infrastructure.

### Summary of Campaigns

| # | Campaign Name / Identifier | Folder / Source Path | Platform | Date(s) Sent | Target Audience | Recipient Count (Logged) | Status |
|---|---|---|---|---|---|---|---|
| **1** | `reengagement_aug_2026` | `apps/web/scripts/local-campaigns/reengagement_aug_2026/` | Resend | Aug 11, 2026 | Inactive registered users (split by 0 vs 1–5 completed lessons) | 33 sent (27 Audience A, 6 Audience B) | **Delivered** |
| **2** | `marketing_aug_2026` | `apps/web/scripts/local-campaigns/marketing_aug_2026/` | Resend | Aug 15, 2026 | Segmented by XP status (Batch 1: XP > 0; Batches 2 & 3: XP = 0) | 154 sent (18 Batch 1, 48 Batch 2, 88 Batch 3) | **Delivered** |
| **3** | `reengagement_did_you_become_pm_aug_2026` | `apps/web/scripts/local-campaigns/reengagement_did_you_become_pm_aug_2026/` | Resend | Aug 16, 2026 | All registered eligible learners (excluding internal/admin) | 135 sent | **Delivered** |
| **4** | `reengagement_pm_journey_aug_2026` | `apps/web/scripts/local-campaigns/reengagement_pm_journey_aug_2026/` | Resend | Aug 24–25, 2026 | All eligible learners partitioned into 3 deterministic batches | 121 sent (40 Batch 1, 41 Batch 2, 40 Batch 3) | **Delivered** |
| **5** | `pm_fellow_linkedin_aug_2026` (`fellow_linkedin_aug_2026`) | `apps/web/scripts/local-campaigns/fellow_linkedin_aug_2026/` | Resend | August 2026 | Active Product Management Fellows (`is_fellow = true`) in 5 batches | Prepared in codebase (`marketing.pm_fellow`) | **Configured / Scripted** |
| **6** | `portfolio_fellow_campaign_aug_2026` | `apps/web/scripts/local-campaigns/portfolio_fellow_campaign_aug_2026/` | Brevo & Resend | Aug 30–31, 2026 | Remaining eligible learners & Fellows (portfolio showcase) | 234 sent | **Delivered** |
| **7** | `website_usage_sep_2026` | `apps/web/scripts/local-campaigns/website_usage_sep_2026/` | Brevo | Sep 2–3, 2026 | Mutually exclusive cohorts: Inactive (0 lessons/0 XP) vs Existing Learners (>=1 lesson or >0 XP) | 265 sent (222 Segment 1, 43 Segment 2) | **Delivered** |
| **8** | `portfolio_activation_sep_2026` | `apps/web/scripts/local-campaigns/portfolio_activation_sep_2026/` | Brevo & Resend (Cron scheduled) | Sep 6, 2026 | Registered learners with 0 submitted capstones | Automated Server-Side Scheduler | **Configured / Scripted** |
| **9** | `prodily_one_month_sep_2026` | `apps/web/scripts/local-campaigns/prodily_one_month_sep_2026/` | Brevo (250) & Resend (64) | Sep 13, 2026 | All registered eligible learners (One-Month Community Celebration) | 314 sent (250 Brevo, 64 Resend) | **Delivered (100% Success)** |
| **10** | `reengagement_inactive_sep_2026` | `apps/web/scripts/local-campaigns/reengagement_inactive_sep_2026/` | Brevo (250) & Resend (27) | Sep 15, 2026 | Registered inactive learners (0 completed lessons, 0 total XP) | 277 sent (250 Brevo, 27 Resend) | **Delivered (100% Success)** |
| **11** | `follow_prodily_sep_2026` | `apps/web/scripts/local-campaigns/follow_prodily_sep_2026/` | Brevo (280) & Resend (72) | Sep 18, 2026 | All registered eligible learners (Social Channels Follow Campaign) | 352 sent (280 Brevo, 72 Resend) | **Delivered (100% Success)** |
| **12** | `email_1_junior_pms_sep_2026` | `apps/web/scripts/local-campaigns/email_1_junior_pms_sep_2026/` | Brevo (280) & Resend (7) | Sep 18, 2026 | Zero-progress learners (0 completed lessons, 0 total XP) | 287 sent (280 Brevo, 7 Resend) | **Delivered (100% Success)** |
| **13** | `whats_actually_stopping_you_sep_2026` | `apps/web/scripts/local-campaigns/whats_actually_stopping_you_sep_2026/` | Resend (90) & Brevo (196) | Sep 19, 2026 | Zero-progress learners (0 completed lessons, 0 total XP) | 286 eligible (90 Resend, 196 Brevo) | **Configured / Scripted** |
| **14** | `small_ask_prodily_sep_2026` | `apps/web/scripts/local-campaigns/small_ask_prodily_sep_2026/` | Resend (90) & Brevo (296) | Sep 25, 2026 | All registered eligible learners (Personal founder update on 500-user goal) | 386 sent (90 Resend, 296 Brevo) | **Delivered (100% Success)** |

---

## Infrastructure, Sending Architecture & Safety Controls

### 1. Delivery Providers & Dynamic Split Routing
- **Resend API:** Primary provider for campaigns 1, 2, 3, 4, 5, and fallback / spillover provider for later campaigns. Outbound API endpoint: `https://api.resend.com/emails`.
- **Brevo API (formerly Sendinblue):** Primary SMTP relay / REST provider configured starting in campaign 6. Outbound API endpoint: `https://api.brevo.com/v3/smtp/email`.
- **Deterministic 250 Brevo + Remainder Resend Dynamic Split:** Established in Campaign 9 (`prodily_one_month_sep_2026`) and standardized in Campaign 10 (`reengagement_inactive_sep_2026`). Registered learners are deterministically ordered by `created_at ASC`, `id ASC`. The first 250 recipients are allocated strictly to Brevo (`BREVO_MAX_ALLOCATION = 250`) to maximize deliverability within daily free tier boundaries, and all remaining eligible recipients are routed to Resend. Strict provider isolation guarantees mutual exclusivity (zero duplicate overlap across providers).
- **Failover Architecture (ADR-001):** Shared provider resolution and single-secondary-attempt failover managed by `apps/web/lib/notifications/providers/`.

### 2. Sender Identities & Header Conventions
- **Default System Sender:** `Prodily <welcome@prodily.adityagangwani.me>` (Configurable via `FROM_EMAIL` / `BRAND.emailFromAddress`).
- **Dedicated Campaign Sender (Campaign 6):** `Prodily <noreply@prodily.adityagangwani.me>`.
- **Founder Identity (Campaigns 4, 7, 8, 9):** `Aditya Gangwani <aditya@prodily.adityagangwani.me>` / `Aditya from Prodily`.
- **Team / Organization Identity (Campaign 10):** `Prodily <welcome@prodily.adityagangwani.me>`.
- **Reply-To Addresses:**
  - `hello@prodily.adityagangwani.me`
  - `prodilypm@gmail.com` (Dedicated marketing campaign inbox).
- **RFC Compliance:** All outbound providers automatically attach RFC-compliant `List-Unsubscribe` headers pointing to `<https://prodily.adityagangwani.me/settings?tab=notifications>`.

### 3. Deliverability Standards & Anti-Promotions Formatting
- **Standardized Primary Tab Placement Formula (September 25, 2026):**
  Established and verified during Campaign 14 (`small_ask_prodily_sep_2026`), where the exact same setup was tested and proved to bypass Gmail's Promotions tab and land reliably in the **Primary / Normal Inbox**:
  1. **From & Reply-To Exact Alignment:** Both set strictly to `Aditya Gangwani <aditya@prodily.adityagangwani.me>` and `aditya@prodily.adityagangwani.me`. Never point `Reply-To` to external `@gmail.com` webmail addresses.
  2. **Suppression of List-Unsubscribe:** Set `suppressListUnsubscribe: true` for direct founder broadcasts and updates. Google's neural classifiers use the presence of `List-Unsubscribe` as an immediate machine-classification trigger to relegate emails to Promotions.
  3. **Suppression of Marketing Tags:** Set `suppressMarketingTags: true` so no `template_key`, `template_version`, or `X-Mailin-Tag` headers are attached by Resend or Brevo.
  4. **Open & Click Tracking Disabled:** Both `open_tracking` and `click_tracking` disabled on sending domains to eliminate redirect proxies and 1x1 tracking pixels that trigger spam and promotional heuristics.
  5. **No Hidden Marketing Preheaders:** Zero-pixel hidden preview text divs (`display:none; font-size:1px...`) are strictly prohibited.
  6. **No Button Blocks / Promotional CTAs:** Eliminate heavy `<button>` elements, colored button wrappers, or marketing action cards. All CTAs must use natural inline paragraph text or clean text links.
  7. **Canonical Minimal Footprint:** Minimal unstyled preferences and unsubscribe links in the footer (`Manage Preferences · Unsubscribe: https://prodily.adityagangwani.me/settings?tab=notifications`).
  8. **Synchronized Multipart Alternative:** Both plain-text and HTML versions sent in exact match.
- **Text-Forward Presentation:** Clean typography on white canvas (`#FFFFFF`) inside the canonical 560px Prodily card layout (`#FBFAF6` canvas, 1px `#DED8CB` border).

### 4. Safety & Idempotency Architecture
- **Local Isolation:** Execution scripts reside under `apps/web/scripts/local-campaigns/` (isolated from public version control via `.gitignore`).
- **Real-Time Eligibility & State Verification:** Real-time pre-send verification queries against Supabase (`public.users`, `public.user_lesson_progress`, `public.xp_events`, and `public.user_notification_preferences`). Before dispatching to each recipient, the script re-verifies that the user has not opted out or completed a lesson in the interim.
- **Deterministic Partitioning:** User cohorts are deterministically partitioned by `created_at` and `id` sorting to guarantee consistent batching across multi-day rollouts.
- **Suppression & Preference Checks:** Strict enforcement of unsubscribes (`user_notification_preferences.all_notifications = false`, `all_email = false`, `marketing_email = false`), `email_suppressions` (bounces and flags), and auth metadata flags.
- **Two-Phase Confirmation Gate:** Interactive CLI confirmation gate requiring explicit operator confirmation (`yes` / `YES`) or explicit CLI flag (`--confirm-send --yes`) before production dispatch.
- **Dual Idempotency:** Synced local JSON logs (`campaign_sent_<campaign_id>.json`) and Supabase database audit records (`public.email_queue`).

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

---

```
================================================================================
CAMPAIGN 7: website_usage_sep_2026
================================================================================
```

### Campaign Metadata
- **Campaign Name:** Website Usage & Daily PM Routine Campaign (September 2026)
- **Campaign Identifier:** `website_usage_sep_2026`
- **Source Folder:** `apps/web/scripts/local-campaigns/website_usage_sep_2026/`
- **Script Path:** `apps/web/scripts/local-campaigns/website_usage_sep_2026/send-website-usage-campaign.ts`
- **Log Path:** `apps/web/scripts/local-campaigns/website_usage_sep_2026/logs/campaign_sent_website_usage_sep_2026.json`
- **Platform:** Brevo (Primary SMTP relay & REST API)
- **Campaign Purpose:** Transform learner mental model from *"Prodily is a course I need to finish"* to *"Prodily is something I can use regularly to build my PM skills"* (*"You don't need to finish Prodily. You need to use it."*).
- **Audience Segmentation:** Two mutually exclusive cohorts based on real-time database progress:
  - **Segment 1 (Registered Inactive):** Registered learners who have not completed any lessons (`0` completed lessons in `user_lesson_progress` and `0` total XP).
  - **Segment 2 (Existing Learners):** Registered learners who have already started (`>= 1` completed lessons in `user_lesson_progress` or `> 0` total XP).
- **Date Sent:** September 2–3, 2026 (`2026-09-02T13:06:48.651Z` to `2026-09-03T05:45:39.151Z`)
- **Sender Name:** Aditya Gangwani
- **Sender Email:** `aditya@prodily.adityagangwani.me`
- **Reply-To Address:** `hello@prodily.adityagangwani.me`
- **Sign-off Persona:** `Aditya (Founder, Prodily)`
- **Unsubscribe URL:** `${siteUrl}/settings?tab=notifications`
- **Logged Deliveries:** 265 successful dispatches (222 Segment 1, 43 Segment 2)

---

### Email 7.1 — Segment 1: Registered but Inactive

**Campaign:** `website_usage_sep_2026`  
**Platform:** Brevo  
**Sequence position:** Segment Variant 1  
**Date:** September 2–3, 2026  
**Audience:** Registered users with `0` completed lessons and `0` total XP  
**Sender:** Aditya Gangwani <aditya@prodily.adityagangwani.me>  
**Reply-To:** hello@prodily.adityagangwani.me  
**Subject:** `I wanted to reach out personally`  
**Preview text:** `A small thought about learning Product Management.`  
**CTA:** `→ Open Prodily`  
**Destination:** `${siteUrl}/academy?utm_source=email&utm_medium=marketing&utm_campaign=website_usage_sep_2026&utm_content=inactive_routine`  
**Status:** Delivered (222 recipients logged)  

#### Exact Email Content (Plain Text)

```text
Hi {{firstName}},

I was looking at how people are getting started with Prodily, and it made me think about something.

A lot of us wait for the “right time” to learn something.

An hour when we're free.
A quiet weekend.
A time when everything else is done.

That time rarely comes.

When I started building Prodily, one thing I wanted to make possible was the opposite — you should be able to learn even when you only have a few minutes.

So if you've signed up but haven't really started yet, don't worry about finishing anything.

Just open one lesson today.

Read it. Think about it. That's enough.

→ Open Prodily: https://prodily.adityagangwani.me/academy?utm_source=email&utm_medium=marketing&utm_campaign=website_usage_sep_2026&utm_content=inactive_routine

I'd genuinely love for you to give it a try.

— Aditya
Founder, Prodily

Manage Preferences · Unsubscribe: https://prodily.adityagangwani.me/settings?tab=notifications
```

---

### Email 7.2 — Segment 2: Existing Learners

**Campaign:** `website_usage_sep_2026`  
**Platform:** Brevo  
**Sequence position:** Segment Variant 2  
**Date:** September 2–3, 2026  
**Audience:** Users with `>= 1` completed lessons or `> 0` total XP  
**Sender:** Aditya Gangwani <aditya@prodily.adityagangwani.me>  
**Reply-To:** hello@prodily.adityagangwani.me  
**Subject:** `I noticed you already got started`  
**Preview text:** `Don't worry about how much is left. Think about what's next.`  
**CTA:** `→ Continue where you left off`  
**Destination:** `${siteUrl}/academy?utm_source=email&utm_medium=marketing&utm_campaign=website_usage_sep_2026&utm_content=existing_learners_routine`  
**Status:** Delivered (43 recipients logged)  

#### Exact Email Content (Plain Text)

```text
Hi {{firstName}},

I noticed you've already spent some time learning on Prodily.

That made me want to send you a quick note.

One thing I've learned while building this is that learning Product Management isn't really about how quickly you finish.

It's about how your thinking changes over time.

You learn something today.

Then a few days later, you see a product differently.

You question a decision.

You ask a better question.

That's the part that matters.

So don't worry about how much of Prodily you have left.

Just pick up where you stopped.

→ Continue where you left off: https://prodily.adityagangwani.me/academy?utm_source=email&utm_medium=marketing&utm_campaign=website_usage_sep_2026&utm_content=existing_learners_routine

I'll see you inside.

— Aditya
Founder, Prodily

Manage Preferences · Unsubscribe: https://prodily.adityagangwani.me/settings?tab=notifications
```

---

```
================================================================================
CAMPAIGN 8: portfolio_activation_sep_2026
================================================================================
```

### Campaign Metadata
- **Campaign Name:** Public Portfolio & First Capstone Activation
- **Campaign Identifier:** `portfolio_activation_sep_2026`
- **Source Folder:** `apps/web/scripts/local-campaigns/portfolio_activation_sep_2026/`
- **Script Path:** `apps/web/scripts/local-campaigns/portfolio_activation_sep_2026/send-portfolio-activation-campaign.ts`
- **Service Runner:** `apps/web/lib/campaigns/portfolio-activation-runner.ts`
- **Platform:** Brevo (`aditya@prodily.adityagangwani.me`) with Resend failover
- **Campaign Purpose:** Re-engage learners by highlighting their live public portfolio URL (`/p/[username]`) and motivating them to submit their first capstone deliverable to unlock their visual Skill Radar.
- **Audience:** Current registered Prodily learners with `0` submitted capstones.
- **Server-Side Scheduled Execution:** Uses Supabase `email_broadcasts` persistence + Prodily's existing 5-minute automated cron runner (`/api/cron/process-broadcasts` triggered 24/7 by GitHub Actions and/or Vercel Cron).
- **Date Prepared:** September 6, 2026
- **Sender Name:** Aditya from Prodily
- **Sender Email:** `aditya@prodily.adityagangwani.me`
- **Reply-To Address:** `prodilypm@gmail.com`
- **Canonical CTA URL:** `https://prodily.adityagangwani.me/capstones` (Clean URL, no marketing UTMs)
- **Unsubscribe URL:** `https://prodily.adityagangwani.me/settings?tab=notifications`
- **Status:** Configured / Scripted in repository

---

### Email 8.1 — Portfolio Activation ("Your Prodily portfolio is ready")

**Campaign:** `portfolio_activation_sep_2026`  
**Platform:** Brevo & Resend  
**Sequence position:** 1 of 1  
**Audience:** Registered learners with 0 submitted capstones  
**Sender:** Aditya from Prodily <aditya@prodily.adityagangwani.me>  
**Reply-To:** prodilypm@gmail.com  
**Subject:** `Your Prodily portfolio is ready`  
**Preview text:** `I wanted to point out something that's already available on your Prodily account.`  
**CTA:** `Add your first capstone`  
**Destination:** `https://prodily.adityagangwani.me/capstones`  
**Status:** Configured / Scripted  

#### Exact Email Content (Plain Text)

```text
Hi {{firstName}},

I wanted to point out something that's already available on your Prodily account.

You have a public portfolio page that you can use on LinkedIn, your resume, or share directly with a recruiter:

{{portfolioUrl}}

At the moment, your portfolio is still empty because you haven't added a capstone yet.

Once you add your first capstone, your portfolio can start showing the work you've done on Prodily, along with your skill breakdown and skill radar.

You don't need to complete the entire curriculum before you can start building it. Your first capstone is enough to get things started.

If you'd like to set it up, you can add your first capstone here:

Add your first capstone: https://prodily.adityagangwani.me/capstones

Your portfolio is already there. It just needs something to show.

— Aditya
Prodily

Manage Preferences / Unsubscribe: https://prodily.adityagangwani.me/settings?tab=notifications
```

---

```
================================================================================
CAMPAIGN 9: prodily_one_month_sep_2026
================================================================================
```

### Campaign Metadata
- **Campaign Name:** Prodily One-Month Celebration Campaign
- **Campaign Identifier:** `prodily_one_month_sep_2026`
- **Source Folder:** `apps/web/scripts/local-campaigns/prodily_one_month_sep_2026/`
- **Script Path:** `apps/web/scripts/local-campaigns/prodily_one_month_sep_2026/send-prodily-one-month-campaign.ts`
- **Log Path:** `apps/web/scripts/local-campaigns/prodily_one_month_sep_2026/logs/campaign_sent_prodily_one_month_sep_2026.json`
- **Platform:** Brevo (first 250) & Resend (remaining 64)
- **Campaign Purpose:** Celebrate one month of Prodily with existing registered learners, thank them for being part of the early community, and invite honest feedback and referrals.
- **Audience Allocation (Dynamic Split):**
  - Deterministically ordered by `created_at ASC`, `id ASC` from `public.users`.
  - First 250 eligible recipients &rarr; **Brevo** (`BREVO_MAX_ALLOCATION = 250`).
  - Remaining 64 eligible recipients &rarr; **Resend**.
  - Strict provider isolation (zero overlap across providers).
- **Date Sent:** September 13, 2026 (`2026-09-13T11:57:02.091Z` to `2026-09-13T12:06:04.650Z`)
- **Sender Name:** Aditya Gangwani
- **Sender Email:** `aditya@prodily.adityagangwani.me`
- **Reply-To Address:** `prodilypm@gmail.com`
- **Sign-off Persona:** `Aditya Gangwani (Founder, Prodily)`
- **Primary CTA:** `Bring a friend to Prodily` &rarr; `https://prodily.adityagangwani.me/settings?tab=referrals`
- **Unsubscribe URL:** `${siteUrl}/settings?tab=notifications`
- **Logged Deliveries:** **314 successful dispatches** (250 Brevo, 64 Resend) — **100% Success Rate, 0 Failures**

---

### Email 9.1 — Founder Note: One Month of Prodily

**Campaign:** `prodily_one_month_sep_2026`  
**Platform:** Brevo & Resend  
**Sequence position:** 1 of 1  
**Date:** September 13, 2026  
**Audience:** All eligible registered learners  
**Sender:** Aditya Gangwani <aditya@prodily.adityagangwani.me>  
**Reply-To:** prodilypm@gmail.com  
**Subject:** `One month of Prodily.`  
**Preview text:** `Prodily turned one month old this week — a founder note from Aditya.`  
**CTA:** `Bring a friend to Prodily`  
**Destination:** `https://prodily.adityagangwani.me/settings?tab=referrals`  
**Status:** Delivered (314 recipients logged)  

#### Exact Email Content (Plain Text)

```text
Hey {{firstName}},

Prodily turned one month old this week.

And honestly, I didn’t know what to expect when we launched.

One month later, 300+ people have started learning product management with us — completely free.

That number means a lot to me. But what means even more is seeing people actually use Prodily, build things, share their work, and tell me what we could do better.

Over the past month, we’ve added Product Management Fellow verification, public portfolios, badges, leaderboards, and referrals — all with the same goal:

A course completion doesn't get someone a PM job. Proof of work does.

We’re still figuring out a lot. Some of the feedback I’ve received this month has genuinely changed what I think Prodily should become.

So I want to hear from you.

What’s working? What feels missing? What should we build next?

Just reply to this email. I read every response myself, and your feedback will directly shape what comes next.

And one small favour:

If you know someone trying to break into product management, learning PM, or simply wanting to get better at thinking about products, bring them along.

You can refer a friend from Settings → Refer a Friend:

Bring a friend to Prodily
https://prodily.adityagangwani.me/settings?tab=referrals

Referral URL:
https://prodily.adityagangwani.me/settings?tab=referrals

No complicated pitch. Just share something you think could genuinely help someone.

Thank you for being here in month one.

We’re just getting started.

— Aditya Gangwani
Founder, Prodily

Manage Preferences · Unsubscribe: https://prodily.adityagangwani.me/settings?tab=notifications
```

---

```
================================================================================
CAMPAIGN 10: reengagement_inactive_sep_2026
================================================================================
```

### Campaign Metadata
- **Campaign Name:** Inactive User Re-engagement Campaign (September 2026)
- **Campaign Identifier:** `reengagement_inactive_sep_2026`
- **Source Folder:** `apps/web/scripts/local-campaigns/reengagement_inactive_sep_2026/`
- **Script Path:** `apps/web/scripts/local-campaigns/reengagement_inactive_sep_2026/send-inactive-reengagement-campaign.ts`
- **Test Suite Path:** `apps/web/scripts/local-campaigns/reengagement_inactive_sep_2026/test_campaign.ts`
- **Log Path:** `apps/web/scripts/local-campaigns/reengagement_inactive_sep_2026/logs/campaign_sent_reengagement_inactive_sep_2026.json`
- **Platform:** Brevo (first 250) & Resend (remaining 27)
- **Campaign Purpose:** Re-engage registered users who signed up for Prodily but have remained inactive (`0` completed lessons in `user_lesson_progress` and `0` total XP), with a supportive, low-pressure, text-first message reassuring them that their progress is right where they left it.
- **Audience Allocation (Dynamic Split):**
  - Evaluated against live database `public.users` (347 registered users).
  - Excluded 60 active learners (`> 0` lessons or `> 0` XP), 3 internal admins, 7 suppressions, 0 opt-outs.
  - Deterministically ordered by `created_at ASC`, `id ASC`.
  - **First 250 recipients &rarr; Brevo** (`BREVO_MAX_ALLOCATION = 250`).
  - **Remaining 27 recipients &rarr; Resend**.
  - Strict mutual exclusivity (zero duplicate overlap across providers).
- **Date Sent:** September 15, 2026 (`2026-09-15T16:07:49.900Z` to `2026-09-15T16:15:04.535Z`)
- **Sender Name:** Prodily
- **Sender Email:** `welcome@prodily.adityagangwani.me`
- **Reply-To Address:** `prodilypm@gmail.com`
- **Sign-off Persona:** `Team Prodily`
- **Primary CTA:** `Continue your journey →` &rarr; `https://prodily.adityagangwani.me/academy` (Clean canonical destination, zero commercial UTMs)
- **Unsubscribe URL:** `https://prodily.adityagangwani.me/settings?tab=notifications`
- **Anti-Promotions Tab Optimization:**
  - 100% text-forward presentation on native white canvas (`#ffffff`).
  - Eliminated hero graphic, outer container boxes, drop shadows, and heavy bordered cards.
  - Replaced bulky block button with clean text link (`Continue your journey →`).
  - Removed commercial UTM query strings (`utm_medium=marketing`) to avoid algorithmic filtering into Gmail's Promotions tab.
  - Retained compliant CAN-SPAM / GDPR footer and RFC-compliant `List-Unsubscribe` headers.
- **Logged Deliveries:** **277 successful dispatches** (250 Brevo, 27 Resend) — **100% Success Rate, 0 Failures**

---

### Email 10.1 — Inactive Learner Re-engagement ("Ready to pick up where you left off?")

**Campaign:** `reengagement_inactive_sep_2026`  
**Platform:** Brevo & Resend  
**Sequence position:** 1 of 1  
**Date:** September 15, 2026  
**Audience:** Inactive registered learners (0 completed lessons, 0 total XP)  
**Sender:** Prodily <welcome@prodily.adityagangwani.me>  
**Reply-To:** prodilypm@gmail.com  
**Subject:** `Ready to pick up where you left off?`  
**Preview text:** `Your progress is still here. Take your next step when you're ready.`  
**CTA:** `Continue your journey →`  
**Destination:** `https://prodily.adityagangwani.me/academy`  
**Status:** Delivered (277 recipients logged)  

#### Exact Email Content (Plain Text)

```text
Hey {{firstName}},

It’s been a while.

While you’ve been away, your progress on Prodily is still right where you left it.

No catching up. No starting over.

Just pick up where you left off and take your next step.

Whether it’s one lesson, one new skill, or one more step toward your goals, small progress still counts.

Continue your journey →
https://prodily.adityagangwani.me/academy

See you on Prodily.

— Team Prodily

Manage Preferences · Unsubscribe: https://prodily.adityagangwani.me/settings?tab=notifications
```

---

```
================================================================================
CAMPAIGN 11: follow_prodily_sep_2026
================================================================================
```

### Campaign Metadata
- **Campaign Name:** Follow Prodily Beyond the App (Social Channels Announcement)
- **Campaign Identifier:** `follow_prodily_sep_2026`
- **Source Folder:** `apps/web/scripts/local-campaigns/follow_prodily_sep_2026/`
- **Script Path:** `apps/web/scripts/local-campaigns/follow_prodily_sep_2026/send-follow-prodily-campaign.ts`
- **Log Path:** `apps/web/scripts/local-campaigns/follow_prodily_sep_2026/logs/campaign_sent_follow_prodily_sep_2026.json`
- **Platform:** Brevo (280 recipients) & Resend (72 recipients)
- **Campaign Purpose:** Invite registered learners to follow Prodily across social channels (LinkedIn, X, Instagram) for product frameworks, building updates, and new feature announcements outside the app.
- **Campaign Type:** Community & Social Activation Broadcast
- **Audience Allocation (Dynamic Split):**
  - Evaluated against live database `public.users` (362 registered users).
  - Excluded 3 internal admins, 7 suppressions, 0 opt-outs.
  - Deterministically ordered by `created_at ASC`, `id ASC`.
  - **First 280 recipients → Brevo** (`BREVO_MAX_ALLOCATION = 280`).
  - **Remaining 72 recipients → Resend**.
  - Strict mutual exclusivity (zero duplicate overlap across providers).
- **Date Sent:** September 18, 2026 (`2026-09-17T20:12:00Z` to `2026-09-17T20:24:47Z` UTC / September 18 IST)
- **Sender Name:** Aditya Gangwani
- **Sender Email:** `aditya@prodily.adityagangwani.me`
- **Reply-To Address:** `prodilypm@gmail.com`
- **Sign-off Persona:** `Aditya (Founder, Prodily)`
- **Destination URLs:**
  - LinkedIn: `https://www.linkedin.com/company/prodilypmacademy`
  - X: `https://x.com/prodily_pm`
  - Instagram: `https://www.instagram.com/prodily_pm/`
- **Unsubscribe URL:** `https://prodily.adityagangwani.me/settings?tab=notifications`
- **UI & Presentation Design:**
  - Zero raw URLs displayed in HTML body — replaced with clean, touch-friendly dedicated action buttons.
  - Embedded Retina-sharp white brand glyphs for LinkedIn, X, and Instagram.
  - Platform-specific brand colors:
    - LinkedIn: `#0A66C2` (LinkedIn Blue)
    - X: `#000000` (X Black)
    - Instagram: `#E1306C` / Multi-stop gradient
  - Plain-text fallback preserves full URLs for accessibility and non-HTML email clients.
  - Compliant CAN-SPAM / GDPR footer and RFC-compliant `List-Unsubscribe` headers.
- **Logged Deliveries:** **352 successful dispatches** (280 Brevo, 72 Resend) — **100% Success Rate, 0 Failures**

---

### Email 11.1 — Follow Prodily Beyond the App

**Campaign:** `follow_prodily_sep_2026`  
**Platform:** Brevo (280) & Resend (72)  
**Sequence position:** 1 of 1  
**Date:** September 18, 2026  
**Audience:** All registered eligible learners  
**Sender:** Aditya Gangwani <aditya@prodily.adityagangwani.me>  
**Reply-To:** prodilypm@gmail.com  
**Subject:** `Follow Prodily beyond the app`  
**Preview text:** `LinkedIn, X, and Instagram — for when you're not logged in.`  
**Primary CTAs:**
- `Follow on LinkedIn` → `https://www.linkedin.com/company/prodilypmacademy`
- `Follow on X` → `https://x.com/prodily_pm`
- `Follow on Instagram` → `https://www.instagram.com/prodily_pm/`
**Status:** Delivered (352 recipients logged: 280 Brevo, 72 Resend)  

#### Exact Email Content (Plain Text)

```text
Hey {{firstName}},

We're starting to share more outside the app — real product frameworks, what we're building, and updates as new things ship.

LinkedIn: https://www.linkedin.com/company/prodilypmacademy
X: https://x.com/prodily_pm
Instagram: https://www.instagram.com/prodily_pm/

No extra noise — just product.

— Aditya
Founder, Prodily

Manage Preferences · Unsubscribe: https://prodily.adityagangwani.me/settings?tab=notifications
```

---

```
================================================================================
CAMPAIGN 12: email_1_junior_pms_sep_2026
================================================================================
```

### Campaign Metadata
- **Campaign Name:** Email #1 — “A question most junior PMs can't answer”
- **Campaign Identifier:** `email_1_junior_pms_sep_2026`
- **Source Folder:** `apps/web/scripts/local-campaigns/email_1_junior_pms_sep_2026/`
- **Script Path:** `apps/web/scripts/local-campaigns/email_1_junior_pms_sep_2026/send-email-1-junior-pms-campaign.ts`
- **Log Path:** `apps/web/scripts/local-campaigns/email_1_junior_pms_sep_2026/logs/campaign_sent_email_1_junior_pms_sep_2026.json`
- **Platform:** Brevo (280 recipients) & Resend (7 recipients)
- **Campaign Purpose:** Deliver Email #1 to registered users with zero recorded progress (0 completed lessons and 0 XP). The email shares a punchy, authentic founding question from Lesson 1 of Prodily ("What is Product Management?") with no sales pitch, reframing what the PM role is truly accountable for and inviting them to open the academy.
- **Campaign Type:** Educational Value / Zero-Progress Activation Broadcast
- **Audience Allocation (Dynamic Split):**
  - Evaluated against live database `public.users` (365 registered users).
  - Filtered strictly for **zero-progress learners**: `0` completed lessons in `user_lesson_progress` AND `0` total XP in `users.total_xp`.
  - Excluded 68 active learners (`> 0` lessons or `> 0` XP), 3 internal admins, 7 suppressions, 0 opt-outs.
  - Deterministically ordered by `created_at ASC`, `id ASC`.
  - **First 280 recipients → Brevo** (`BREVO_MAX_ALLOCATION = 280`).
  - **Remaining 7 recipients → Resend** (Rank 281 to 287).
  - Strict mutual exclusivity (zero duplicate overlap across providers).
- **Date Sent:** September 18, 2026 (`2026-09-18T14:52:58.506Z` to `2026-09-18T14:56:20.023Z` UTC)
- **Sender Name:** Prodily
- **Sender Email:** `welcome@prodily.adityagangwani.me`
- **Display From:** `Prodily <welcome@prodily.adityagangwani.me>`
- **Reply-To Address:** `prodilypm@gmail.com`
- **Sign-off Persona:** `— The Prodily Team`
- **Primary CTA:** `Open Prodily →` → `https://prodily.adityagangwani.me/academy`
- **Unsubscribe URL:** `https://prodily.adityagangwani.me/settings?tab=notifications`
- **Lesson 1 Excerpt (Curriculum-Accredited):**
  - *Source:* `content/lessons/lesson-001.md` (Lesson 1 of 90: "What is Product Management?", lines 5–11, 51–55).
  - *Question:* *"If a PM doesn’t write code, design the interface, or manage engineers — what are they accountable for?"*
  - *Takeaway:* *"Most say “managing the roadmap.” But the real job is deciding, with evidence, which problem is worth solving."*
- **Presentation Design & Anti-Promotions Controls:**
  - Lightweight branded container (`#FBFAF6` canvas with crisp `#FFFFFF` card, subtle 1px border `#DED8CB`).
  - Styled branded CTA button with Prodily green (`#1F6B4E`).
  - Real-time pre-send re-verification of opt-outs (`isFreshOptOut`) and lesson progress (`hasUserBecameActive`).
  - Compliant CAN-SPAM / GDPR footer and RFC-compliant `List-Unsubscribe` headers.
- **Logged Deliveries:** **287 successful dispatches** (280 Brevo, 7 Resend) — **100% Success Rate, 0 Failures**

---

### Email 12.1 — Email #1: A question most junior PMs can't answer

**Campaign:** `email_1_junior_pms_sep_2026`  
**Platform:** Brevo (280) & Resend (7)  
**Sequence position:** 1 of 1  
**Date:** September 18, 2026  
**Audience:** Zero-progress registered learners (0 completed lessons, 0 total XP)  
**Sender:** Prodily <welcome@prodily.adityagangwani.me>  
**Reply-To:** prodilypm@gmail.com  
**Subject:** `A question most junior PMs can't answer`  
**Preview text:** `No pitch — just something from inside the course.`  
**Primary CTA:** `Open Prodily →` → `https://prodily.adityagangwani.me/academy`  
**Sign-off:** `— The Prodily Team`  
**Status:** Delivered (287 recipients logged: 280 Brevo, 7 Resend — 0 failures)  

#### Exact Email Content (Plain Text)

```text
Hey {{firstName}},

Not asking you to start anything today. Just sharing one idea from inside Prodily.

If a PM doesn’t write code, design the interface, or manage engineers — what are they accountable for?

Most say “managing the roadmap.” But the real job is deciding, with evidence, which problem is worth solving.

That’s one idea, from one lesson, out of 90.

Open Prodily: https://prodily.adityagangwani.me/academy

— The Prodily Team

Manage Preferences · Unsubscribe: https://prodily.adityagangwani.me/settings?tab=notifications
```

---

```
================================================================================
CAMPAIGN 13: whats_actually_stopping_you_sep_2026
================================================================================
```

### Campaign Metadata
- **Campaign Name:** Email — “What's actually stopping you?”
- **Campaign Identifier:** `whats_actually_stopping_you_sep_2026`
- **Source Folder:** `apps/web/scripts/local-campaigns/whats_actually_stopping_you_sep_2026/`
- **Script Path:** `apps/web/scripts/local-campaigns/whats_actually_stopping_you_sep_2026/send-whats-actually-stopping-you-campaign.ts`
- **Log Path:** `apps/web/scripts/local-campaigns/whats_actually_stopping_you_sep_2026/logs/campaign_sent_whats_actually_stopping_you_sep_2026.json`
- **Platform:** Resend (first 90 recipients) & Brevo (remaining 196 recipients)
- **Campaign Purpose:** Deliver an authentic, personal, reply-driven inquiry to registered users with zero recorded progress (0 completed lessons and 0 XP). The email genuinely asks what is stopping them from starting, avoiding promotional reminders or marketing CTAs and inviting direct email replies.
- **Campaign Type:** Founder Outreach / Personal Reply-Driven Lifecycle Broadcast
- **Audience Allocation (Dynamic Split):**
  - Evaluated against live database `public.users` (366 registered users).
  - Filtered strictly for **zero-progress learners**: `0` completed lessons in `user_lesson_progress` AND `0` total XP in `users.total_xp`.
  - Excluded 70 active learners (`> 0` lessons or `> 0` XP), 3 internal admins, 7 suppressions, 0 opt-outs.
  - Deterministically ordered by `created_at ASC`, `id ASC`.
  - **First 90 recipients → Resend** (`RESEND_MAX_ALLOCATION = 90`, Rank 1 to 90).
  - **Remaining 196 recipients → Brevo** (Rank 91 to 286).
  - Strict mutual exclusivity (zero duplicate overlap across providers).
- **Date Prepared:** September 19, 2026
- **Sender Name:** Aditya Gangwani (supports `Aditya | Prodily` via `--sender-name`)
- **Sender Email:** `aditya@prodily.adityagangwani.me`
- **Display From:** `Aditya Gangwani <aditya@prodily.adityagangwani.me>`
- **Reply-To Address:** `prodilypm@gmail.com`
- **Sign-off Persona:** `— Aditya Gangwani` / `Founder, Prodily`
- **Primary CTA:** None — intentionally reply-only.
- **Unsubscribe URL:** `https://prodily.adityagangwani.me/settings?tab=notifications`
- **Presentation Design & Anti-Promotions Controls:**
  - Lightweight, personal text-first presentation on native `#ffffff` canvas with no marketing cards, hero images, or buttons.
  - Real-time pre-send re-verification of opt-outs (`isFreshOptOut`) and lesson progress (`hasUserBecameActive`).
  - Compliant CAN-SPAM / GDPR footer and RFC-compliant `List-Unsubscribe` headers.
- **Status:** **Scripted & Validated (Pending Operator Send)**

---

### Email 13.1 — What's actually stopping you?

**Campaign:** `whats_actually_stopping_you_sep_2026`  
**Platform:** Resend (90) & Brevo (196)  
**Sequence position:** 1 of 1  
**Date Prepared:** September 19, 2026  
**Audience:** Zero-progress registered learners (0 completed lessons, 0 total XP)  
**Sender:** Aditya Gangwani <aditya@prodily.adityagangwani.me>  
**Reply-To:** prodilypm@gmail.com  
**Subject:** `What's actually stopping you?`  
**Preview text:** `Genuinely asking — not another reminder.`  
**Primary CTA:** None (Reply-only)  
**Sign-off:** `— Aditya Gangwani` <br> `Founder, Prodily`  
**Status:** Prepared & Validated (286 eligible recipients: 90 Resend, 196 Brevo)  

#### Exact Email Content (Plain Text)

```text
Hey {{firstName}},

Can I ask you something?

You signed up for Prodily a while ago, but haven't started a lesson yet. I'm not going to send you another reminder to come back.

I'm more interested in understanding why you haven't started.

Maybe you're too busy right now. Maybe you're learning PM somewhere else. Maybe you're not sure Prodily is what you're looking for.

Or maybe it's something completely different.

If you have a minute, just reply to this email and tell me. Even a couple of words is enough.

I'm asking because I'd rather understand what's getting in the way than keep sending you reminders that aren't useful.

— Aditya Gangwani
Founder, Prodily

Manage Preferences · Unsubscribe: https://prodily.adityagangwani.me/settings?tab=notifications
```

---

```
================================================================================
CAMPAIGN 14: small_ask_prodily_sep_2026
================================================================================
```

### Campaign Metadata
- **Campaign Name:** Founder Update — “a small ask about Prodily”
- **Campaign Identifier:** `small_ask_prodily_sep_2026`
- **Source Folder:** `apps/web/scripts/local-campaigns/small_ask_prodily_sep_2026/`
- **Script Path:** `apps/web/scripts/local-campaigns/small_ask_prodily_sep_2026/send-small-ask-prodily-campaign.ts`
- **Log Path:** `apps/web/scripts/local-campaigns/small_ask_prodily_sep_2026/logs/campaign_sent_small_ask_prodily_sep_2026.json`
- **Platform:** Resend (first 90 recipients) & Brevo (remaining 296 recipients)
- **Campaign Purpose:** Personal founder update from Aditya Gangwani sharing an honest milestone reflection (set a goal for 500 users, currently at 396) and asking engaged Prodily learners to share the platform with 1–2 peers who might benefit.
- **Campaign Type:** Founder Milestone & Reflection / Word-of-Mouth Ask Broadcast
- **Audience Allocation (Dynamic Split):**
  - Evaluated against live database `public.users` (396 registered users).
  - Excluded 3 internal admins (`adityagangwaniexam@gmail.com`, `pmacademyapp@gmail.com`, `ryangomez9965@gmail.com`), 7 suppressions, 0 opt-outs.
  - Total eligible recipients: **386 learners**.
  - Deterministically ordered by `created_at ASC`, `id ASC`.
  - **First 90 recipients → Resend** (`RESEND_MAX_ALLOCATION = 90`, Rank 1 to 90).
  - **Remaining 296 recipients → Brevo** (Rank 91 to 386).
  - Strict mutual exclusivity (zero duplicate overlap across providers).
- **Date Sent:** September 25, 2026
- **Sender Name:** Aditya Gangwani
- **Sender Email:** `aditya@prodily.adityagangwani.me`
- **Display From:** `Aditya Gangwani <aditya@prodily.adityagangwani.me>`
- **Reply-To Address:** `aditya@prodily.adityagangwani.me` (Strictly aligned with From)
- **Sign-off Persona:** `Aditya` \n `Founder, Prodily`
- **Primary CTA:** None (personal reflection, word-of-mouth share ask)
- **Unsubscribe URL:** `https://prodily.adityagangwani.me/settings?tab=notifications`
- **Inbox Deliverability & Placement Results:**
  - **Primary Tab Placement:** Verified landing in Gmail **Primary / Normal Inbox** (bypassed Promotions tab).
  - **Deliverability Formula Applied:**
    1. Aligned `Reply-To` to sender domain (`aditya@prodily.adityagangwani.me`).
    2. Suppressed `List-Unsubscribe` header (`suppressListUnsubscribe: true`).
    3. Suppressed marketing/template tags (`suppressMarketingTags: true`).
    4. Domain-level open tracking and click tracking disabled.
    5. Zero-pixel hidden marketing preheader divs eliminated.
    6. Zero CTA button elements; natural paragraph typography.
    7. Synchronized multipart alternative (`text/plain` + `text/html`).
- **Status:** **Delivered to Production (386 recipients: 90 Resend, 296 Brevo — 100% Success)**

---

### Email 14.1 — a small ask about Prodily

**Campaign:** `small_ask_prodily_sep_2026`  
**Platform:** Resend (90) & Brevo (296)  
**Sequence position:** 1 of 1  
**Date:** September 25, 2026  
**Audience:** All registered eligible learners (386 total)  
**Sender:** Aditya Gangwani <aditya@prodily.adityagangwani.me>  
**Reply-To:** aditya@prodily.adityagangwani.me  
**Subject:** `a small ask about Prodily`  
**Preview text:** `Quick honest update from me.`  
**Primary CTA:** None  
**Sign-off:** `Aditya` <br> `Founder, Prodily`  
**Status:** Delivered (386 recipients logged: 90 Resend, 296 Brevo — 0 failures)  

#### Exact Email Content (Plain Text)

```text
Hey,

Quick honest update from me.

I set a goal a few weeks back to get Prodily to 500 users by end of this month. We're at 396 right now, and I'm just going to say it, I probably won't hit 500. Getting a new product in front of the right people is way harder than I expected, even when you've built something you're proud of.

Not complaining, just being upfront.

You've been using Prodily for a bit now, so you probably get it better than most people ever will. The number was never really the point for me though. What I actually care about is having enough people using it that I can learn from them. Right now I genuinely don't know if the PM Fellow status is landing the way I hoped, whether people actually value putting it on their LinkedIn or if it's just a nice to have nobody really cares about. More real usage is the only way I find that out.

So if Prodily's been useful to you, it would mean a lot if you shared it with one or two people who might actually benefit. Forward this email, mention it if it comes up, whatever's easiest. No pressure either way.

Thanks for using it, and thanks for reading this.

Aditya
Founder, Prodily

Manage Preferences · Unsubscribe: https://prodily.adityagangwani.me/settings?tab=notifications
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
