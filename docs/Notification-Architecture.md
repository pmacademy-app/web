# PM Academy — Notification & Communication Architecture

**Status:** Design Complete — Pre-Implementation Blueprint
**Version:** 1.0
**Created:** 2026-08-05
**Owner:** Solo founder
**Companion docs:** `Architecture.md`, `PRD.md`, `AUTH_FLOW.md`, `Phases.md`

> [!IMPORTANT]
> This is the **single source of truth** for every notification, communication, and email feature in PM Academy. No notification system may be built without first aligning to this blueprint. Read this before writing any email-related code.

---

## Table of Contents

1. [Vision](#1-vision)
2. [Design Principles](#2-design-principles)
3. [Event-Driven Architecture](#3-event-driven-architecture)
4. [Communication Pipeline](#4-communication-pipeline)
5. [Email Infrastructure](#5-email-infrastructure)
6. [Future Notification Channels](#6-future-notification-channels)
7. [Queue Architecture](#7-queue-architecture)
8. [Scheduler Architecture](#8-scheduler-architecture)
9. [Retry Strategy](#9-retry-strategy)
10. [Rate Limiting](#10-rate-limiting)
11. [User Notification Preferences](#11-user-notification-preferences)
12. [Template System](#12-template-system)
13. [Analytics](#13-analytics)
14. [Monitoring](#14-monitoring)
15. [Security](#15-security)
16. [Local Development](#16-local-development)
17. [Deployment](#17-deployment)
18. [Scaling Strategy](#18-scaling-strategy)
19. [Disaster Recovery](#19-disaster-recovery)
20. [Admin Notification Center](#20-admin-notification-center)
21. [Developer Experience](#21-developer-experience)
22. [Database Design](#22-database-design)
23. [Future Expansion](#23-future-expansion)
24. [Sprint 6 Implementation Roadmap](#24-sprint-6-implementation-roadmap)

---

## 1. Vision

PM Academy's notification system is a **learning reinforcement engine**, not a marketing broadcast tool. Every message sent should answer one question:

> *Does this communication genuinely help this learner make progress toward their goal?*

The system must:
- Reward genuine learning milestones (lesson completions, badges, certifications)
- Nudge learners back into learning habits without being manipulative
- Respect user preferences absolutely — no dark patterns, ever
- Scale from 100 to 100,000+ users without requiring a redesign
- Support a future multi-channel world (push, SMS, WhatsApp, Slack) without rebuilding the event layer

The architecture is **event-driven at its core**. Email (or any other channel) is simply one delivery mechanism for a learning event. The event layer, preference system, queue, and logging infrastructure are channel-agnostic by design.

---

## 2. Design Principles

| Principle | Description |
|-----------|-------------|
| **Event-first, channel-second** | Every communication originates from a learning event, not an email campaign decision. The event fires; the system decides whether and how to deliver it. |
| **Learner respect** | No urgency manufacturing, no fake scarcity, no FOMO tricks. Reminders inform; they do not manipulate. |
| **Consent is non-negotiable** | Marketing and product update emails require explicit opt-in. Transactional and security emails are always enabled. |
| **One source of truth per event** | Each learning event fires exactly once. Duplicate sends are a bug, not a feature. |
| **Silent failure by default** | A notification failure never interrupts the learning flow. Emails are best-effort, not blockers. |
| **Graceful degradation** | If Resend is down or rate-limited, the learning app continues to function. Emails queue and retry. |
| **Observability** | Every email sent, queued, failed, or skipped is logged with enough context to diagnose any problem. |
| **Privacy by design** | Minimum PII sent to any third-party service. No behavioral data leaves Supabase. |
| **Free-tier first** | Design to operate entirely within Resend free tier (3,000 emails/month, 100/day) for the first 1,000 active users. Plan the upgrade trigger explicitly. |

---

## 3. Event-Driven Architecture

### 3.1 Core Concept

The notification system listens for **learning events** — meaningful moments in a user's learning journey. Every event carries a typed payload. Downstream handlers decide what to do with it (queue an email, award a badge, update the leaderboard, etc.).

This separates *what happened* from *what to do about it*, making the system extensible without modifying existing event producers.

### 3.2 Event Registry

The following events are the canonical triggers for all notifications. Each event ID is stable and must never be renamed once shipped.

**Learning Events**

| Event ID | Triggered When |
|---|---|
| `lesson.completed` | User marks all lesson sections done |
| `lesson.started` | User opens a lesson for the first time |
| `module.completed` | User completes all 10 lessons in module |
| `capstone.submitted` | User submits a capstone assignment |
| `capstone.draft_saved` | User saves a capstone draft |
| `review.completed` | User completes a flashcard review session |
| `review.session_due` | SRS queue has cards due today |
| `flashcard.due_bulk` | Batch: N cards due for a user |

**Gamification Events**

| Event ID | Triggered When |
|---|---|
| `xp.level_up` | User crosses a level threshold |
| `xp.milestone` | User reaches a notable XP total |
| `streak.updated` | Daily streak incremented |
| `streak.at_risk` | User has not studied by 8 PM local time |
| `streak.broken` | User's streak resets to 0 |
| `streak.comeback` | User restores streak after break |
| `badge.earned` | User earns any badge |
| `leaderboard.rank_improved` | User moves up N positions in leaderboard |

**Portfolio Events**

| Event ID | Triggered When |
|---|---|
| `portfolio.published` | User makes their portfolio public |
| `portfolio.viewed` | Portfolio page viewed by another user |
| `certificate.generated` | Certificate is created and signed |
| `skill.milestone_reached` | Skill radar cluster crosses a threshold |

**Auth & Account Events**

| Event ID | Triggered When |
|---|---|
| `user.created` | New account registered |
| `user.waitlist_joined` | Email added to waitlist |
| `user.email_verified` | Email address confirmed |
| `user.password_reset` | Password reset requested |
| `user.email_changed` | Account email address updated |
| `user.account_deleted` | Account deletion confirmed |
| `user.login_suspicious` | Login from new device/location |

**System Events**

| Event ID | Triggered When |
|---|---|
| `system.weekly_recap` | Scheduled: every Sunday evening |
| `system.daily_reminder` | Scheduled: user's preferred time |
| `system.inactive_nudge` | Scheduled: user inactive 7 days |
| `system.capstone_reminder` | Scheduled: module done, no capstone yet |
| `system.feature_release` | Admin broadcast: new feature shipped |
| `system.maintenance` | Admin broadcast: planned downtime |

### 3.3 Event Payload Schema

Every event carries a typed, serializable payload. All events share a base envelope:

```typescript
interface NotificationEvent<T = Record<string, unknown>> {
  id: string           // UUID — idempotency key
  event: string        // e.g. 'lesson.completed'
  userId: string       // Supabase auth user UUID
  userEmail: string    // resolved at event time, not at send time
  userName: string     // display name for template personalization
  userTimezone: string // from users.timezone — for scheduling
  occurredAt: string   // ISO 8601 UTC timestamp
  payload: T           // event-specific data
  metadata?: {
    sourceRoute?: string    // which API route fired the event
    correlationId?: string  // for tracing cross-system flows
  }
}
```

**Example: `lesson.completed` payload**

```typescript
interface LessonCompletedPayload {
  lessonId: string         // stable les_XXXXXX ID
  lessonTitle: string
  lessonOrder: number      // global 1-90 order
  moduleSlug: string
  moduleName: string
  quizScore: number        // 0-100
  xpEarned: number
  totalXp: number          // new cumulative total
  newLevel?: number        // if level-up occurred
  newBadges?: string[]     // badge keys earned this completion
  isModuleComplete: boolean
  completedAt: string
}
```

**Example: `badge.earned` payload**

```typescript
interface BadgeEarnedPayload {
  badgeKey: string
  badgeName: string
  badgeDescription: string
  badgeCategory: string
  totalBadgesEarned: number
  earnedAt: string
}
```

### 3.4 Event Firing Pattern

Events are fired from **API route handlers** after the primary database mutation succeeds. The event must never block the HTTP response.

```typescript
// Pattern: fire-and-forget inside API route
async function POST(request: Request) {
  // 1. Primary mutation
  const result = await completeLesson(supabase, userId, lessonId, ...)

  // 2. Fire event — never await, never block
  void fireNotificationEvent({
    event: 'lesson.completed',
    userId,
    userEmail: user.email,
    userName: user.name ?? 'Learner',
    userTimezone: user.timezone ?? 'UTC',
    payload: { lessonId, lessonTitle, xpEarned: result.xp_earned, ... }
  })

  // 3. Respond immediately
  return NextResponse.json({ success: true, xpEarned: result.xp_earned })
}
```

`fireNotificationEvent()` inserts a row into `notification_events` and enqueues emails based on user preferences. It must never throw uncaught exceptions into the route handler.

---

## 4. Communication Pipeline

### 4.1 End-to-End Flow

```
PM Academy API Route
  Primary mutation succeeds
    void fireNotificationEvent(event)
      Notification Router
        1. Log event to notification_events
        2. Check user notification preferences
        3. Apply rate limiting rules
        4. For each applicable channel:
           -> Insert row into email_queue (status: 'pending')
           -> [Future] push_queue, sms_queue

Vercel Cron (hourly)
  /api/cron/process-email-queue
    Batch SELECT pending rows (priority ASC, 50 at a time)
      For each row:
        Update status -> 'processing'
        Render React Email template with variables
        Send via Resend API
        Success: status -> 'delivered'
        Failure: status -> 'failed', schedule retry
          attempt_count >= max: -> dead_letter

Resend Webhooks -> /api/email/webhooks
  Record open, click, bounce, complaint events
    Bounces/complaints -> email_suppressions
```

### 4.2 Email Categories and Channels

| Category | Send Type | Opt-out Allowed | Channel |
|----------|-----------|-----------------|---------||
| **Transactional / Auth** | Immediate | No — always sent | Email |
| **Security** | Immediate | No — always sent | Email |
| **Learning — Achievements** | Queued | Yes — per preference | Email |
| **Learning — Reminders** | Scheduled | Yes — per preference | Email, [Push future] |
| **Learning — Recaps** | Scheduled | Yes — per preference | Email |
| **Product Updates** | Queued | Yes — per preference | Email |
| **Admin Broadcasts** | Queued (bulk) | Yes — per preference | Email |
| **Marketing** | Queued (bulk) | Yes — explicit opt-in only | Email |

---

## 5. Email Infrastructure

### 5.1 Provider: Resend

PM Academy uses **Resend** as the sole email provider (already integrated in `lib/email.ts`).

- **Free tier:** 3,000 emails/month, 100/day
- **Integration:** Direct REST API (no SDK — keeps bundle clean)
- **Webhook:** Resend delivers open/click/bounce/complaint events to `/api/email/webhooks`
- **Upgrade trigger:** Daily sends consistently hitting 80 emails/day. Switch to Resend Pro ($20/mo, 50k/month).

### 5.2 Sender Configuration

```
Transactional:  "PM Academy" <welcome@pmacademy.com>  Reply-To: support@pmacademy.com
Notifications:  "PM Academy" <learn@pmacademy.com>    Reply-To: support@pmacademy.com
Product/Admin:  "PM Academy" <news@pmacademy.com>     Reply-To: support@pmacademy.com
```

Different sending addresses allow domain-level reputation separation. Transactional reputation is never harmed by marketing volume.

### 5.3 Complete Email Catalogue

#### Authentication Emails (bypass queue — immediate send)

| Template Key | Subject | Trigger | Always Send |
|---|---|---|---|
| `auth.welcome` | "Welcome to PM Academy" | `user.created` | Yes |
| `auth.verify_email` | "Confirm your PM Academy email" | Supabase signup | Yes |
| `auth.password_reset` | "Reset your PM Academy password" | Supabase reset | Yes |
| `auth.magic_link` | "Your PM Academy login link" | Supabase magic link | Yes |
| `auth.email_changed` | "Your email address was updated" | `user.email_changed` | Yes |
| `auth.waitlist_confirmed` | "You're on the list!" | `user.waitlist_joined` | Yes |

#### Learning Emails (queued, preference-gated)

| Template Key | Subject | Trigger Event | Default |
|---|---|---|---|
| `learning.daily_reminder` | "Your PM lesson is waiting" | `system.daily_reminder` | ON |
| `learning.weekly_recap` | "Your week in PM Academy" | `system.weekly_recap` | ON |
| `learning.resume_learning` | "Pick up where you left off" | `system.inactive_nudge` | ON |
| `learning.review_due` | "{{N}} flashcards ready for review" | `review.session_due` | ON |
| `learning.module_complete` | "Module {{name}} complete!" | `module.completed` | ON |
| `learning.capstone_reminder` | "Your {{module}} capstone awaits" | `system.capstone_reminder` | ON |
| `learning.streak_at_risk` | "Don't break your {{N}}-day streak!" | `streak.at_risk` | ON |

#### Achievement Emails (queued, preference-gated)

| Template Key | Subject | Trigger Event | Default |
|---|---|---|---|
| `achievement.badge_earned` | "You earned: {{badge_name}}" | `badge.earned` | ON |
| `achievement.level_up` | "Level {{N}} unlocked!" | `xp.level_up` | ON |
| `achievement.certificate` | "Your PM Academy certificate is ready" | `certificate.generated` | ON |
| `achievement.portfolio_published` | "Your portfolio is live" | `portfolio.published` | ON |
| `achievement.skill_milestone` | "{{skill}} competency: {{level}}" | `skill.milestone_reached` | ON |

#### Product Emails (queued, preference-gated)

| Template Key | Subject | Trigger | Default |
|---|---|---|---|
| `product.feature_release` | "What's new in PM Academy" | `system.feature_release` | ON |
| `product.maintenance` | "Scheduled maintenance notice" | `system.maintenance` | ON |
| `product.product_update` | "PM Academy update" | Admin-triggered | ON |

#### Security Emails (always sent, no opt-out)

| Template Key | Subject | Trigger |
|---|---|---|
| `security.suspicious_login` | "New sign-in to your account" | `user.login_suspicious` |
| `security.account_deleted` | "Your account has been deleted" | `user.account_deleted` |
| `security.policy_update` | "Important policy update" | Admin-triggered |

#### Marketing Emails (explicit opt-in only, future)

| Template Key | Subject | Trigger |
|---|---|---|
| `marketing.newsletter` | "PM Academy Monthly" | Scheduled |
| `marketing.community` | "Join the PM Academy community" | Scheduled |
| `marketing.survey` | "Help us improve PM Academy" | Admin-triggered |

---

## 6. Future Notification Channels

The event system is channel-agnostic. The event fires once; handlers for each channel are registered independently. Adding a new channel requires adding a new queue table and registering a handler — no changes to existing event producers.

### 6.1 Planned Channels

| Channel | Target Phase | Dependency | Notes |
|---------|--------------|------------|-------|
| **Email** | Phase 3 Sprint 6 | Resend (exists) | Current sprint |
| **Browser Push** | Phase 4 | Web Push API + VAPID keys | Requires user permission prompt |
| **Mobile Push** | Phase 5 | Expo / Firebase FCM | Requires native app |
| **SMS** | Phase 6 | Twilio / AWS SNS | High-value only: certificate, streak recovery |
| **WhatsApp** | Phase 7 | WhatsApp Business API | APAC market expansion |
| **Slack** | Future | Slack App | Enterprise/cohort market |
| **Discord** | Future | Discord Webhooks | Community feature |

---

## 7. Queue Architecture

### 7.1 Why Queue Instead of Immediate Send?

| Risk | Immediate Send | Queued Send |
|------|---------------|-------------|
| **Resend API timeout** | HTTP response delayed or fails | User unaffected |
| **Resend rate limit** | Email dropped silently | Retried automatically |
| **Resend outage** | Email lost | Retried when Resend recovers |
| **Learning flow interrupt** | Learner waits for email | Learner sees result instantly |
| **Batch efficiency** | N API calls for N users | Centralized batch processing |
| **Observability** | Logs scattered across routes | Centralized queue log |
| **Retry logic** | Reimplemented everywhere | Implemented once |

### 7.2 Queue Tables

```sql
-- Primary email queue
email_queue (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references users(id) on delete cascade not null,
  to_email          text not null,
  to_name           text,
  template_key      text not null,
  template_variables jsonb not null default '{}',
  event_id          text,
  event_type        text not null,
  priority          int not null default 5,      -- 1=urgent, 5=normal, 10=bulk
  status            text not null default 'pending',
  attempt_count     int not null default 0,
  max_attempts      int not null default 3,
  scheduled_at      timestamptz not null default now(),
  next_retry_at     timestamptz,
  processing_at     timestamptz,
  delivered_at      timestamptz,
  failed_at         timestamptz,
  resend_id         text,
  error_message     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Dead letter queue (permanently failed)
email_dead_letter (
  id                uuid primary key default gen_random_uuid(),
  original_queue_id uuid references email_queue(id),
  user_id           uuid references users(id),
  template_key      text not null,
  template_variables jsonb not null default '{}',
  failure_reason    text,
  all_errors        jsonb not null default '[]',
  created_at        timestamptz not null default now()
);

-- Event log (source of truth for what happened)
notification_events (
  id                uuid primary key default gen_random_uuid(),
  event_type        text not null,
  user_id           uuid references users(id) on delete cascade not null,
  payload           jsonb not null default '{}',
  channels_notified text[] not null default '{}',
  skipped_reason    text,
  created_at        timestamptz not null default now()
);

-- Delivery event log (webhook-sourced from Resend)
email_delivery_events (
  id             uuid primary key default gen_random_uuid(),
  email_queue_id uuid references email_queue(id),
  resend_id      text,
  event_type     text not null, -- 'delivered'|'opened'|'clicked'|'bounced'|'complained'|'unsubscribed'
  metadata       jsonb not null default '{}',
  occurred_at    timestamptz not null default now()
);

-- Bounce and suppression list
email_suppressions (
  id            uuid primary key default gen_random_uuid(),
  email         text unique not null,
  reason        text not null,  -- 'bounced'|'complained'|'unsubscribed'|'admin'
  suppressed_at timestamptz not null default now(),
  expires_at    timestamptz  -- null = permanent
);
```

### 7.3 Email Status Lifecycle

```
pending
  -> [scheduled_at reached] -> processing
      -> [send success]     -> delivered
      -> [send failure]     -> failed
          -> [attempt < max]  -> retrying  -> processing (retry)
          -> [attempt >= max] -> dead_letter
```

### 7.4 Priority Levels

| Priority | Value | Use Cases |
|---|---|---|
| Urgent | 1 | Security alerts, password resets |
| High | 2 | Certificate generated, level up |
| Normal | 5 | Badge earned, module complete, weekly recap |
| Low | 8 | Daily reminders, review nudges |
| Bulk | 10 | Admin broadcasts, newsletters |

Processors drain queues in priority order. Bulk sends never block urgent sends.

### 7.5 Batch Processing

```
Batch size:          50 emails per invocation
Processing strategy: SELECT FOR UPDATE SKIP LOCKED (prevents double-processing)
Concurrency:         1 cron invocation at a time (Vercel ensures this)
Timeout:             60 seconds max (Vercel hobby tier function limit)
```

---

## 8. Scheduler Architecture

### 8.1 Vercel Cron Jobs

PM Academy uses **Vercel Cron** (available on hobby tier) for all scheduled notification jobs. All cron routes verify `Authorization: Bearer ${CRON_SECRET}`.

**vercel.json:**

```json
{
  "crons": [
    { "path": "/api/cron/process-email-queue", "schedule": "0 * * * *" },
    { "path": "/api/cron/daily-reminders",     "schedule": "0 * * * *" },
    { "path": "/api/cron/weekly-recap",         "schedule": "0 18 * * 0" },
    { "path": "/api/cron/inactive-nudge",       "schedule": "0 9 * * *" },
    { "path": "/api/cron/capstone-reminder",    "schedule": "0 10 * * 1" },
    { "path": "/api/cron/retry-failed",         "schedule": "0 */3 * * *" },
    { "path": "/api/cron/cleanup",              "schedule": "0 2 * * *" }
  ]
}
```

### 8.2 Cron Job Specifications

**`/api/cron/process-email-queue`** (Hourly)
- Query: pending emails with `scheduled_at <= now()`, ordered by priority ASC, LIMIT 50
- Atomically mark as processing, render template, call Resend, update status
- Must complete within 55 seconds

**`/api/cron/daily-reminders`** (Hourly)
- Query: users with `daily_reminder = true` whose local time matches `preferred_reminder_hour`
- Check: user has not completed a lesson today (in their timezone)
- Idempotency: check email_queue for existing pending reminder for today before inserting

**`/api/cron/weekly-recap`** (Sunday 6 PM UTC)
- Query: all users with `weekly_recap = true`
- Aggregate: lessons, XP, streak, badges, skill radar deltas for the past week
- Batch cursor pagination: 500 users per cron run

**`/api/cron/inactive-nudge`** (Daily 9 AM UTC)
- Query: users with no lesson progress in 7 days and `resume_nudge = true`
- Check: no nudge sent in the last 14 days

**`/api/cron/capstone-reminder`** (Monday 10 AM UTC)
- Query: users who completed all 10 lessons of a module but have no capstone submission
- Check: module completed > 3 days ago; no reminder sent in last 7 days

**`/api/cron/retry-failed`** (Every 3 hours)
- Query: failed emails with `next_retry_at <= now() AND attempt_count < max_attempts`

**`/api/cron/cleanup`** (Daily 2 AM UTC)
- Delete `notification_events` > 90 days old
- Delete `email_delivery_events` > 180 days old
- Delete delivered `email_queue` rows > 60 days old

### 8.3 Timezone-Aware Delivery

```typescript
function shouldReceiveReminderThisHour(
  userTimezone: string,
  preferredHour: number  // 0-23, user-configured local hour
): boolean {
  const userLocalHour = new Date()
    .toLocaleString('en-US', { timeZone: userTimezone, hour: 'numeric', hour12: false })
  return parseInt(userLocalHour) === preferredHour
}
```

The hourly cron runs globally (UTC) and filters users whose local hour matches their preference. This avoids per-user cron jobs (which would require a paid scheduling service).

---

## 9. Retry Strategy

### 9.1 Exponential Backoff

```typescript
function calculateNextRetryAt(attemptCount: number): Date {
  const delays = [5, 30, 120]  // minutes
  const delayMinutes = delays[attemptCount] ?? 120
  return new Date(Date.now() + delayMinutes * 60 * 1000)
}
```

| Attempt | Delay | Cumulative Wait |
|---------|-------|-----------------|
| 1st failure | 5 min | 5 min |
| 2nd failure | 30 min | 35 min |
| 3rd failure | 2 hours | ~2.5 hours |
| -> dead letter | — | Permanently failed |

### 9.2 Non-Retriable Errors

The following errors move directly to dead letter without retrying:
- `422 Unprocessable Entity` (invalid email address)
- `400 Bad Request` (malformed payload — template bug)
- Hard bounce (recipient domain does not exist)
- Complaint event (user reported as spam)

### 9.3 Suppression List Check

Before any email is sent, check `email_suppressions` for the recipient. If found: do not send, update queue status to `suppressed`, log the suppression reason.

---

## 10. Rate Limiting

### 10.1 Per-User Rate Limits

| Category | Limit | Window |
|----------|-------|--------|
| Achievement emails | Max 3 | Per day |
| Learning reminders | Max 1 | Per day |
| Weekly recap | Max 1 | Per week |
| Inactive nudges | Max 1 | Per 14 days |
| Capstone reminders | Max 1 | Per 7 days |
| Security alerts | Unlimited | — |
| Auth emails | Unlimited | — |

### 10.2 Global Send Rate Limits (Resend Free Tier Protection)

```typescript
const DAILY_SEND_LIMIT = 90    // buffer below Resend's 100/day limit
const HOURLY_SEND_LIMIT = 30   // smooth distribution across the day
```

If the daily limit is approaching, bulk/low-priority emails are deferred to the next day. High-priority and auth emails always go through.

---

## 11. User Notification Preferences

### 11.1 Preference Table

```sql
user_notification_preferences (
  user_id                       uuid primary key references users(id) on delete cascade,

  -- Global kill switch
  all_notifications             boolean not null default true,
  all_email                     boolean not null default true,

  -- Learning category
  daily_reminder                boolean not null default true,
  weekly_recap                  boolean not null default true,
  resume_nudge                  boolean not null default true,
  review_reminders              boolean not null default true,
  module_complete               boolean not null default true,
  capstone_reminders            boolean not null default true,
  streak_alerts                 boolean not null default true,

  -- Achievement category
  badge_notifications           boolean not null default true,
  level_up_notifications        boolean not null default true,
  certificate_notifications     boolean not null default true,
  portfolio_notifications       boolean not null default true,
  skill_milestone_notifications boolean not null default true,

  -- Product category
  product_updates               boolean not null default true,
  feature_releases              boolean not null default true,
  maintenance_alerts            boolean not null default true,

  -- Marketing (explicit opt-in only — default OFF)
  marketing_emails              boolean not null default false,
  newsletter                    boolean not null default false,
  survey_invites                boolean not null default false,

  -- Scheduling
  preferred_reminder_hour       int not null default 9,  -- 0-23 in user's timezone
  timezone                      text not null default 'UTC',

  -- Unsubscribe tracking
  global_unsubscribed_at        timestamptz,
  unsubscribe_token             text unique,  -- for one-click unsubscribe links

  updated_at                    timestamptz not null default now()
);
```

### 11.2 Preference UI Location

`/settings` -> Notifications tab. Structure:

```
Notifications
+-- Global Settings
|   +-- [Toggle] Email notifications
|   +-- [Toggle] All notifications
+-- Learning
|   +-- [Toggle] Daily study reminders
|   |     +-- [Select] Reminder time: 9:00 AM (user's timezone)
|   +-- [Toggle] Weekly progress recap
|   +-- [Toggle] Flashcard review reminders
|   +-- [Toggle] Module completion emails
|   +-- [Toggle] Capstone assignment reminders
|   +-- [Toggle] Streak alerts
+-- Achievements
|   +-- [Toggle] Badge notifications
|   +-- [Toggle] Level-up notifications
|   +-- [Toggle] Certificate notifications
|   +-- [Toggle] Portfolio & Skill milestone notifications
+-- Product
|   +-- [Toggle] Feature releases
|   +-- [Toggle] Maintenance alerts
+-- Marketing (opt-in required)
    +-- [Toggle] Newsletter (monthly)
    +-- [Toggle] Surveys & feedback
```

### 11.3 Unsubscribe Handling

All non-transactional emails include:
1. One-click unsubscribe link in email footer (RFC 8058 compliant)
2. `List-Unsubscribe` header for native email client support
3. "Manage Preferences" link -> `/settings?tab=notifications`

Unsubscribe link format: `/api/email/unsubscribe?token={{unsubscribe_token}}&category={{category}}`

Tokens are per-user, not per-email. Clicking unsubscribe once is sufficient for the user's lifetime.

---

## 12. Template System

### 12.1 Technology: React Email

All templates are built with **React Email** — TypeScript-first, component-based, with local hot-reload preview, HTML + plain-text dual output, and inline style rendering compatible with all email clients.

### 12.2 Folder Structure

```
apps/web/
+-- emails/
    +-- components/
    |   +-- layout/
    |   |   +-- EmailWrapper.tsx    # Base layout: header, footer, unsubscribe
    |   |   +-- EmailHeader.tsx     # PM Academy logo
    |   |   +-- EmailFooter.tsx     # Unsubscribe, manage prefs, address
    |   +-- ui/
    |   |   +-- Button.tsx          # CTA button with brand colors
    |   |   +-- StatCard.tsx        # XP / lesson count display card
    |   |   +-- BadgeDisplay.tsx    # Badge icon + name display
    |   |   +-- ProgressBar.tsx     # Skill/module progress bar
    |   |   +-- LessonCard.tsx      # Lesson title + module + link
    |   +-- partials/
    |       +-- StreakWidget.tsx    # Current streak display
    |       +-- LevelWidget.tsx     # XP level + career title
    |       +-- NextLessonCTA.tsx   # "Resume learning" block
    +-- templates/
    |   +-- auth/
    |   |   +-- Welcome.tsx
    |   |   +-- WaitlistConfirmed.tsx
    |   |   +-- EmailChanged.tsx
    |   +-- learning/
    |   |   +-- DailyReminder.tsx
    |   |   +-- WeeklyRecap.tsx
    |   |   +-- ResumeNudge.tsx
    |   |   +-- ReviewDue.tsx
    |   |   +-- ModuleComplete.tsx
    |   |   +-- CapstoneReminder.tsx
    |   +-- achievement/
    |   |   +-- BadgeEarned.tsx
    |   |   +-- LevelUp.tsx
    |   |   +-- CertificateEarned.tsx
    |   |   +-- PortfolioPublished.tsx
    |   |   +-- SkillMilestone.tsx
    |   +-- product/
    |   |   +-- FeatureRelease.tsx
    |   |   +-- Maintenance.tsx
    |   +-- security/
    |       +-- SuspiciousLogin.tsx
    |       +-- PolicyUpdate.tsx
    +-- index.ts  # Template registry: key -> component map
```

### 12.3 Template Registry

```typescript
// emails/index.ts
export const EMAIL_TEMPLATES = {
  'auth.welcome':                  Welcome,
  'auth.waitlist_confirmed':        WaitlistConfirmed,
  'learning.daily_reminder':        DailyReminder,
  'learning.weekly_recap':          WeeklyRecap,
  'achievement.badge_earned':       BadgeEarned,
  'achievement.level_up':           LevelUp,
  'achievement.certificate':        CertificateEarned,
  // ... all templates
} as const

export type TemplateKey = keyof typeof EMAIL_TEMPLATES

export async function renderTemplate(
  key: TemplateKey,
  variables: Record<string, unknown>
): Promise<{ html: string; text: string }> {
  const Component = EMAIL_TEMPLATES[key]
  const html = await render(<Component {...variables} />)
  const text = await render(<Component {...variables} />, { plainText: true })
  return { html, text }
}
```

### 12.4 Shared Layout

Every template wraps in `EmailWrapper`:

```
+--------------------------------------------------+
|  PM Academy                  [View in browser]   |
+--------------------------------------------------+
|                                                  |
|         [Template-specific content]              |
|                                                  |
+--------------------------------------------------+
|  PM Academy - 90 lessons. Free forever.          |
|  [Manage Preferences] . [Unsubscribe]            |
|  (c) 2026 PM Academy. All rights reserved.       |
+--------------------------------------------------+
```

### 12.5 Design Tokens

```typescript
const tokens = {
  primary:           '#d97706',  // amber-600 (matches web app)
  primaryDark:       '#b45309',
  background:        '#fbfaf6',  // warm off-white
  cardBg:            '#ffffff',
  textPrimary:       '#1a1a1a',
  textSecondary:     '#525252',
  textMuted:         '#737373',
  border:            '#e5e5e5',
  success:           '#16a34a',
  fontFamily:        "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  fontSerif:         "Georgia, 'Times New Roman', serif",
  containerMaxWidth: '560px',
  paddingMd:         '24px',
  paddingLg:         '32px',
  borderRadius:      '12px',
}
```

### 12.6 Accessibility and Standards

- Plain text alternative for every email
- `<html lang="en">` on all templates
- All images have descriptive alt text
- WCAG AA color contrast ratios
- Dark mode: `@media (prefers-color-scheme: dark)` styles for Outlook and Apple Mail
- All user-facing strings extracted to a `strings` object per template (i18n-ready)

---

## 13. Analytics

### 13.1 Metrics Tracked

| Metric | Source | Storage |
|--------|--------|---------|
| Sent | Queue processor | `email_queue.delivered_at` |
| Delivered | Resend webhook | `email_delivery_events` |
| Opened | Resend webhook (pixel) | `email_delivery_events` |
| Clicked | Resend webhook | `email_delivery_events` |
| Bounced (soft) | Resend webhook | `email_delivery_events` |
| Bounced (hard) | Resend webhook | `email_delivery_events` + `email_suppressions` |
| Complained | Resend webhook | `email_delivery_events` + `email_suppressions` |
| Unsubscribed | Our endpoint | `user_notification_preferences` + `email_suppressions` |
| Failed | Queue processor | `email_queue.error_message` |

### 13.2 Webhook Processing

Resend sends delivery events to `/api/email/webhooks`. This endpoint:
1. Validates the `svix-signature` header
2. Matches the `resend_id` to a row in `email_queue`
3. Inserts a row in `email_delivery_events`
4. For bounces/complaints: adds to `email_suppressions`

---

## 14. Monitoring

### 14.1 Health Signals

| Signal | Healthy | Warning | Critical |
|--------|---------|---------|----------|
| Queue depth (pending) | < 100 | 100-500 | > 500 |
| Dead letter rate (24h) | < 1% | 1-5% | > 5% |
| Daily send count | < 90 | — | > 90 |
| Retry queue depth | < 20 | 20-50 | > 50 |
| Webhook failure rate | < 1% | 1-3% | > 3% |

### 14.2 Logging Pattern

```typescript
console.log('[notification:event] lesson.completed fired', { userId, lessonId })
console.log('[notification:router] queuing badge.earned email', { userId, templateKey })
console.log('[notification:queue] batch processed', { count: 42, failed: 1 })
console.log('[notification:resend] delivered', { resendId, queueId })
console.error('[notification:retry] failed permanently', { queueId, attempts: 3, error })
```

---

## 15. Security

### 15.1 API Key Management

| Secret | Location | Usage |
|--------|----------|-------|
| `RESEND_API_KEY` | Vercel env vars (server-only) | Email sending |
| `CRON_SECRET` | Vercel env vars | Cron job authorization |
| `EMAIL_WEBHOOK_SECRET` | Vercel env vars | Resend webhook validation |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel env vars | Queue processor (server-only) |

None of these secrets appear in client-side code, logs, or error messages. No `NEXT_PUBLIC_*` prefix ever.

### 15.2 Cron Route Authentication

```typescript
const cronSecret = request.headers.get('Authorization')?.replace('Bearer ', '')
if (cronSecret !== process.env.CRON_SECRET) {
  return new Response('Unauthorized', { status: 401 })
}
```

### 15.3 Webhook Authentication

```typescript
import { Webhook } from 'svix'
const wh = new Webhook(process.env.EMAIL_WEBHOOK_SECRET!)
const payload = wh.verify(rawBody, headers)  // throws if invalid
```

### 15.4 PII Handling

- `to_email` in `email_queue` cleaned up after 60 days (delivered rows)
- Resend API receives only `to`, `from`, `subject`, `html` — no behavioral data
- GDPR: user account deletion cascades to all notification tables
- `email_suppressions` email hashed after 30 days post-account-deletion

### 15.5 Unsubscribe Token Security

Tokens are per-user (not per-email), generated at account creation as `crypto.randomUUID()`, stored in `user_notification_preferences.unsubscribe_token`. No auth required on the unsubscribe endpoint — the token validates identity.

---

## 16. Local Development

### 16.1 Environment Setup

```bash
# .env.local
RESEND_API_KEY=                # Leave empty: emails log to console, not sent
CRON_SECRET=dev-cron-secret    # For calling cron routes locally
EMAIL_WEBHOOK_SECRET=dev-key   # For local webhook testing
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

When `RESEND_API_KEY` is empty, `lib/email.ts` logs to console:

```
[email] RESEND_API_KEY missing. Simulating send to user@example.com: "Module 2 Complete!"
```

### 16.2 Email Preview Server

```bash
npm run email:dev
# Opens React Email preview at http://localhost:3001
# Hot-reloads templates on save, shows HTML + plain text
```

Add to `package.json`:

```json
{
  "scripts": {
    "email:dev":    "email dev ./emails",
    "email:export": "email export ./emails --outDir ./emails/out"
  }
}
```

### 16.3 Testing Email Flows

```bash
# Trigger a specific notification (dev only)
curl -X POST http://localhost:3000/api/dev/send-test-email \
  -H "Content-Type: application/json" \
  -d '{"template": "achievement.level_up", "userId": "your-user-id"}'

# Process queue manually
curl -X POST http://localhost:3000/api/cron/process-email-queue \
  -H "Authorization: Bearer dev-cron-secret"
```

---

## 17. Deployment

### 17.1 Required Environment Variables

```bash
RESEND_API_KEY=re_live_XXXXXXXXXXXX
CRON_SECRET=<generated-uuid>
EMAIL_WEBHOOK_SECRET=<from-resend-dashboard>
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
NEXT_PUBLIC_APP_URL=https://pmacademy.com
```

### 17.2 Database Migration Naming

```
20260806000001_create_notification_preferences.sql
20260806000002_create_email_queue.sql
20260806000003_create_notification_events.sql
20260806000004_create_email_suppressions.sql
20260806000005_add_notification_rls_policies.sql
```

---

## 18. Scaling Strategy

| Stage | Users | Infrastructure | Monthly Cost |
|-------|-------|----------------|--------------|
| MVP | 0-500 | Resend free (3k/month), Vercel hobby crons | $0 |
| Early traction | 500-2,000 | Resend Starter ($20/mo, 50k/month) | $20 |
| Growth | 2,000-10,000 | Resend Pro ($89/mo, 100k/month) | $89 |
| Scale | 10,000-50,000 | Resend Pro + queue index optimization | ~$89 |
| Enterprise | 50,000+ | Evaluate AWS SES ($0.10/1000) | Variable |

**Vercel Pro upgrade trigger:** When notification system requires > 2 distinct cron schedules (estimated ~1,000 active users).

**Queue scaling:** PostgreSQL-backed queue works to ~50,000 users/month. Above this, consider BullMQ + Redis via Upstash.

---

## 19. Disaster Recovery

### 19.1 Scenarios and Responses

| Scenario | Impact | Recovery |
|----------|--------|----------|
| **Resend outage** | Emails not delivered | Queue retries automatically when Resend recovers |
| **Vercel cron failure** | Batch skipped | Failed emails retry next cron run |
| **Database connection failure** | Emails not queued | Event logged to console; no user impact |
| **Template render failure** | Single email fails | Dead letter; other emails unaffected |
| **Webhook failure** | Delivery events not recorded | Analytics gap only; Resend webhook replay |
| **Rate limit hit** | Emails delayed | Low-priority deferred; auth/urgent always sent |

### 19.2 Manual Override Routes

```
POST   /api/admin/notifications/pause-queue
POST   /api/admin/notifications/resume-queue
POST   /api/admin/notifications/flush-dead-letter
DELETE /api/admin/notifications/queue-item/:id
```

---

## 20. Admin Notification Center

### 20.1 Location and Access Control

Route: `/admin/notifications`
Access: `users.is_admin = true` column (added in notification migration). Server-side admin check; non-admin -> redirect to `/dashboard`.

### 20.2 Dashboard — Email Health (/admin/notifications)

```
Email Health                                         Last 30 days
+------------------+------------------+------------------+------------------+
| Sent: 4,821      | Delivered: 99%   | Open Rate: 34%   | Click Rate: 12%  |
| Failed: 1.2%     | Dead Letter: 0%  | Bounced: 0.25%   | Unsub: 0.14%     |
+------------------+------------------+------------------+------------------+

Queue Status
Pending: 23 | Processing: 0 | Retry: 4 | Dead Letter: 3
Daily budget: 67 / 90 used (74%)
```

### 20.3 Queue Manager (/admin/notifications/queue)

Full visibility and control over the email queue. Columns: Recipient, Template, Status, Priority, Scheduled, Attempts, Actions.

Filters: Status, Template, Date range, User email search

Bulk actions: Cancel all pending, Retry all failed, Retry all dead letter

### 20.4 Email Logs (/admin/notifications/logs)

Complete searchable delivery history. Search by: user email, template key, status, event type, date range, Resend ID.

Per-email detail: full template variables, HTML preview, delivery events timeline, error messages and retry history.

### 20.5 Template Manager (/admin/notifications/templates)

| Feature | Description |
|---------|-------------|
| **Template list** | All registered templates with key, category, last used |
| **Live preview** | Renders template with sample data in browser |
| **Variable inspector** | Lists all required/optional variables and their types |
| **Send test email** | Form to send any template to an address with custom variables |
| **Resend history** | Last 10 sends for each template with delivery status |

Preview endpoint: `GET /api/admin/notifications/templates/preview?key=achievement.badge_earned&format=html`

### 20.6 Campaign Manager (/admin/notifications/campaigns) — Future-Ready

Supports admin broadcasts to user segments. Campaign lifecycle: `DRAFT -> SCHEDULED -> SENDING -> SENT`.

> [!IMPORTANT]
> Campaign Manager is designed but not implemented in Sprint 6. Build the infrastructure (queue, templates, preferences) first. Campaign Manager ships in a future sprint once the email foundation is proven in production.

### 20.7 User Notification Management (/admin/notifications/users)

Search users and view their notification profile: full preferences, opt-in status, send history (last 20 emails), suppression status, bounce history.

Admin actions: Add/remove suppression, send any template directly.

### 20.8 Analytics Dashboard (/admin/notifications/analytics)

**Tabs:**
1. **Overview** — Sent/Delivered/Opened/Clicked/Failed/Bounced trend (7d/30d/90d)
2. **By Template** — Volume, open rate, click rate, unsubscribe rate per template
3. **By Category** — Learning vs. Achievement vs. Product aggregate stats
4. **Deliverability** — Bounce rate, complaint rate, reputation signals
5. **Engagement** — Templates correlated with lesson completion 24h after email

### 20.9 System Controls (/admin/notifications/settings)

```
System Controls
+-- Email Delivery:    [Enabled]  [Pause All]
+-- Queue Processing:  [Running]  [Pause Queue]
+-- Maintenance Mode:  [Off]      [Enable]
+-- Rate Limits
|   Daily Send Cap:    90 emails/day
|   Hourly Cap:        30 emails/hour
|   Per-user Daily:     3 achievement emails
+-- Retry Policy
    Max Attempts:  3
    Retry Delays:  5min / 30min / 2hr
```

System control state is stored in a `system_settings` key-value table.

---

## 21. Developer Experience

### 21.1 Adding a New Email Template

1. Create template file in `emails/templates/<category>/<Name>.tsx`
2. Register in `emails/index.ts` template registry
3. Add handler case in `lib/notification-router.ts`
4. Preview locally: `npm run email:dev`
5. Test end-to-end: POST to `/api/dev/send-test-email`

### 21.2 Adding a New Notification Event

1. Add the event type to §3.2 event registry in this document
2. Add the TypeScript payload interface in `lib/notification-router.ts`
3. Fire the event from the appropriate API route (fire-and-forget)
4. Add handler case in `lib/notification-router.ts`
5. Add preference toggle to `user_notification_preferences` if needed
6. Write a unit test for the routing logic

### 21.3 Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `RESEND_API_KEY` | Prod only | Leave empty in dev to simulate sends |
| `CRON_SECRET` | All envs | Authenticates cron API routes |
| `EMAIL_WEBHOOK_SECRET` | Prod only | Resend webhook signing secret |
| `NEXT_PUBLIC_APP_URL` | All envs | Base URL for links in emails |

---

## 22. Database Design

### 22.1 Migration Sequence

```
20260806000001_create_notification_preferences.sql
  - user_notification_preferences table
  - ADD COLUMN users.is_admin boolean not null default false

20260806000002_create_email_queue.sql
  - email_queue table with indexes
  - email_dead_letter table

20260806000003_create_notification_events.sql
  - notification_events table
  - email_delivery_events table
  - email_suppressions table

20260806000004_create_system_settings.sql
  - system_settings (key-value for admin controls)

20260806000005_add_notification_rls_policies.sql
  - RLS: Users can only read/update their own notification_preferences
  - All queue/event tables: service role only
```

### 22.2 Critical Indexes

```sql
-- Queue performance (critical path — checked every hour by cron)
CREATE INDEX idx_email_queue_status_scheduled
  ON email_queue (status, scheduled_at)
  WHERE status IN ('pending', 'failed');

CREATE INDEX idx_email_queue_user_id ON email_queue (user_id);
CREATE INDEX idx_email_queue_event_type ON email_queue (event_type, created_at);

-- Delivery event lookups
CREATE INDEX idx_delivery_events_queue_id ON email_delivery_events (email_queue_id);
CREATE INDEX idx_delivery_events_resend_id ON email_delivery_events (resend_id);

-- Suppression list (hot path — checked before every send)
CREATE UNIQUE INDEX idx_suppressions_email ON email_suppressions (email);

-- Notification events
CREATE INDEX idx_notification_events_user_id ON notification_events (user_id, created_at);
```

---

## 23. Future Expansion

### 23.1 Multi-Language Support

Template system is localization-ready. All user-facing strings are extracted to a `strings` object in each template. Future: load strings from a locale file based on `user.locale`.

### 23.2 Notification Feed (In-App)

A future in-app notification center (bell icon in topbar) can reuse `notification_events` as its data source. No architectural change needed — add a new UI consumer of the existing event log.

### 23.3 Multi-Provider Fallback

If Resend goes down for an extended period, the architecture supports a secondary provider (Postmark, AWS SES):

```typescript
async function sendViaProvider(email: QueuedEmail): Promise<SendResult> {
  const primary = await sendViaResend(email)
  if (!primary.success && isPermanentFailure(primary.error)) {
    return sendViaFallback(email)  // future: Postmark or AWS SES
  }
  return primary
}
```

---

## 24. Sprint 6 Implementation Roadmap

### Week 1 — Foundation

| Task | Files | Priority |
|------|-------|----------|
| Database migrations (preferences, queue, events, suppressions) | `supabase/migrations/20260806000001-5.sql` | P0 |
| `lib/notification-router.ts` | New file | P0 |
| `lib/email-queue.ts` | New file | P0 |
| Upgrade `lib/email.ts` to use queue | Existing file | P0 |
| React Email setup + EmailWrapper | `apps/web/emails/` | P0 |

### Week 2 — Auth & Achievement Templates

| Task | Files | Priority |
|------|-------|----------|
| `auth.welcome` + `auth.waitlist_confirmed` templates | `emails/templates/auth/` | P0 |
| `achievement.badge_earned` template | `emails/templates/achievement/` | P1 |
| `achievement.level_up` template | `emails/templates/achievement/` | P1 |
| `achievement.certificate` template | `emails/templates/achievement/` | P1 |
| Event hooks in lesson/badge/certificate API routes | `app/api/v2/lessons/`, `app/api/certificates/` | P1 |

### Week 3 — Scheduler & Learning Reminders

| Task | Files | Priority |
|------|-------|----------|
| Vercel cron configuration | `vercel.json` | P0 |
| `/api/cron/process-email-queue` | New cron route | P0 |
| `/api/cron/retry-failed` | New cron route | P1 |
| `learning.daily_reminder` template + cron | `emails/templates/learning/` | P1 |
| `learning.weekly_recap` template + cron | `emails/templates/learning/` | P1 |
| `learning.resume_nudge` template + cron | `emails/templates/learning/` | P1 |

### Week 4 — Preferences UI and Webhooks

| Task | Files | Priority |
|------|-------|----------|
| Notification preferences UI in `/settings` | `app/(app)/settings/` | P1 |
| `/api/settings/notifications` CRUD route | New API route | P1 |
| Resend webhook handler `/api/email/webhooks` | New API route | P1 |
| Unsubscribe endpoint `/api/email/unsubscribe` | New API route | P1 |
| Cleanup cron | New cron route | P2 |

### Week 5 — Admin Panel

| Task | Files | Priority |
|------|-------|----------|
| `/admin/notifications` dashboard | `app/(admin)/notifications/` | P2 |
| Queue manager view | `app/(admin)/notifications/queue/` | P2 |
| Email logs search | `app/(admin)/notifications/logs/` | P2 |
| Template previewer + test send | `app/(admin)/notifications/templates/` | P2 |
| User notification management | `app/(admin)/notifications/users/` | P2 |
| System controls panel | `app/(admin)/notifications/settings/` | P2 |

### Definition of Done for Sprint 6

- [ ] All database migrations applied, RLS policies active
- [ ] Welcome email sends when a user creates an account
- [ ] Badge notification emails queue and deliver correctly
- [ ] Level-up notification emails queue and deliver correctly
- [ ] Certificate email sends when certificate is generated
- [ ] Daily reminder cron runs hourly, respects user timezone and preference
- [ ] Weekly recap cron runs Sunday evenings with real per-user data
- [ ] Inactive nudge fires after 7 days (not more than once per 14 days)
- [ ] Users can manage all notification preferences from `/settings`
- [ ] Unsubscribe links work without login
- [ ] Resend webhooks record delivered, opened, bounced events
- [ ] Admin queue manager shows all emails and statuses
- [ ] Email logs are searchable by template, user, status, date
- [ ] 0 TypeScript errors, 0 ESLint warnings
- [ ] Production build succeeds
- [ ] Manual end-to-end test: new user -> welcome email received

---

## Changelog

- v1.0 — 2026-08-05: Initial design. Complete event-driven notification architecture covering 30+ typed learning events, 25+ email templates across 6 categories, PostgreSQL queue with priority levels and dead-letter handling, Vercel cron scheduler with timezone-aware delivery, exponential backoff retry strategy, per-user and global rate limiting, full notification preference model, React Email template system with shared design tokens, Admin Notification Center specification (6 views), database schema with critical indexes and RLS policies, and 5-week Sprint 6 implementation roadmap with P0/P1/P2 priorities and a complete Definition of Done.
