# PM Academy — Notification & Communication Architecture

**Status:** Implementation Complete — Architecture Aligned
**Version:** 1.2
**Created:** 2026-08-05
**Owner:** Solo founder
**Companion docs:** `Architecture.md`, `../product/PRD.md`, `AUTH_FLOW.md`, `../product/Phases.md`

> [!IMPORTANT]
> This is the **single source of truth** for every notification, communication, and email feature in PM Academy. No notification system may be built without first aligning to this blueprint. Read this before writing any email-related code.

---

## Table of Contents

1. [Vision](#1-vision)
2. [Design Principles](#2-design-principles)
3. [Event-Driven Architecture](#3-event-driven-architecture)
4. [Communication Pipeline](#4-communication-pipeline)
5. [Email Infrastructure](#5-email-infrastructure)
6. [Multi-Channel Notification Engine (Email & In-App)](#6-multi-channel-notification-engine-email--in-app)
7. [Queue Architecture & Priority Matrix](#7-queue-architecture--priority-matrix)
8. [Scheduler Architecture](#8-scheduler-architecture)
9. [Retry Strategy](#9-retry-strategy)
10. [Rate Limiting](#10-rate-limiting)
11. [User Notification Preferences](#11-user-notification-preferences)
12. [Template System, Versioning & Feature Flags](#12-template-system-versioning--feature-flags)
13. [Analytics & User Notification Timeline](#13-analytics--user-notification-timeline)
14. [Monitoring & System Health Dashboard](#14-monitoring--system-health-dashboard)
15. [Security](#15-security)
16. [Local Development](#16-local-development)
17. [Deployment](#17-deployment)
18. [Scaling Strategy](#18-scaling-strategy)
19. [Disaster Recovery](#19-disaster-recovery)
20. [Admin Console Architecture (/admin)](#20-admin-console-architecture-admin)
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
- Support a multi-channel world (email, in-app, push, SMS, WhatsApp, Slack) without rebuilding the event layer or changing event producers

The architecture is **event-driven at its core**. Email, in-app feeds, and push tokens are simply different delivery mechanisms for a single learning event. The event layer, preference system, queue, and logging infrastructure are channel-agnostic by design.

---

## 2. Design Principles

| Principle | Description |
|-----------|-------------|
| **Event-first, channel-second** | Every communication originates from a learning event. The event fires once; the router determines which channels to push to. |
| **Learner respect** | No urgency manufacturing, no fake scarcity, no FOMO tricks. Reminders inform; they do not manipulate. |
| **Consent is non-negotiable** | Marketing and product update emails require explicit opt-in. Transactional and security emails are always enabled. |
| **One source of truth per event** | Each learning event fires exactly once. Duplicate sends are a bug, not a feature. |
| **Silent failure by default** | A notification failure never interrupts the learning flow. Notifications are best-effort, not blockers. |
| **Graceful degradation** | If Resend is down, the learning app continues to function. Emails queue and retry. If database is slow, in-app notifications degrade gracefully. |
| **Observability** | Every notification sent, queued, failed, suppressed, or opened is logged with complete correlation metadata. |
| **Privacy by design** | Minimum PII sent to any third-party service. No behavioral data leaves Supabase. |
| **Free-tier first** | Design to operate entirely within Resend free tier (3,000 emails/month, 100/day) for the first 1,000 active users. Plan the upgrade trigger explicitly. |

---

## 3. Event-Driven Architecture

### 3.1 Core Concept

The notification system listens for **learning events** — meaningful moments in a user's learning journey. Every event carries a typed payload. Downstream handlers decide what to do with it (queue an email, write an in-app notification, award a badge, update the leaderboard, etc.).

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

### 3.4 Event Firing Pattern

Events are fired from **API route handlers** after the primary database mutation succeeds. The event must never block the HTTP response.

```typescript
// Pattern: fire-and-forget inside API route
async function POST(request: Request) {
  // 1. Primary mutation (the real work)
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

`fireNotificationEvent()` inserts a row into `notification_events` and routes the event to active delivery channels. It must never throw uncaught exceptions into the route handler.

---

## 4. Communication Pipeline

### 4.1 End-to-End Flow

```
PM Academy API Route
  └── Primary mutation succeeds
      └── void fireNotificationEvent(event)
          └── Notification Router
              ├── Log event to notification_events
              ├── Evaluate Feature Flags
              ├── Check user notification preferences
              ├── Evaluate Priority Matrix (delivery routing, rate limits)
              └── Dispatch to active channels:
                  ├── Email Channel -> Insert into email_queue (status: 'pending')
                  ├── In-App Channel -> Insert into in_app_notifications (unread)
                  └── [Future Push Channel] -> Insert into push_queue

Vercel Cron (hourly)
  └── /api/cron/process-email-queue
      └── Batch SELECT pending rows (priority ASC, 50 at a time)
          └── For each row:
              ├── Update status -> 'processing'
              ├── Resolve Template Version
              ├── Render React Email template with variables
              ├── Send via Resend API
              ├── Success: status -> 'delivered'
              └── Failure: status -> 'failed', schedule retry
                  └── attempt_count >= max: -> dead_letter

Resend Webhooks -> /api/email/webhooks
  └── Record open, click, bounce, complaint events in User Notification Timeline
      └── Bounces/complaints -> email_suppressions
```

### 4.2 Communication Strategy & Channel Rules

| Category | Primary Channel | Secondary Channel | Email Opt-out | In-App Opt-out | Default Config | Trigger / Notes |
|----------|-----------------|-------------------|---------------|----------------|----------------|-----------------|
| **Transactional / Auth** | Email | In-App | ❌ Allowed | ❌ Allowed | Always Enabled | Welcome, Verify, Password Reset |
| **Security** | Email + In-App | — | ❌ Allowed | ❌ Allowed | Always Enabled | Suspicious Login, Security Alert |
| **Major Achievements** | In-App | Email | ✅ Allowed | ✅ Allowed | Default ON | Module Completed, Certificate, Portfolio |
| **Daily Learning / Gamification** | In-App Only | — | ❌ N/A | ✅ Allowed | In-App ON / Email OFF | Lesson completed, Quiz, Badge, XP, Streak |
| **Weekly Recap** | Email + In-App | — | ✅ Allowed | ✅ Allowed | Default ON | Weekly scheduled summary (activity required) |
| **Product Announcements** | In-App | Email | ✅ Allowed | ✅ Allowed | Default ON | Admin-initiated broadcasts only (No Auto-send) |
| **Marketing** | Email | In-App | ✅ Allowed | ✅ Allowed | Default OFF | Explicit opt-in only |

*Note: Daily reminder emails, inactivity reminder emails, and daily streak loss reminder emails have been explicitly removed to uphold the Learner Respect Principle.*

---

## 5. Email Infrastructure

### 5.1 Provider: Resend

PM Academy uses **Resend** as the sole email provider (already integrated in `lib/email.ts`).

- **Free tier:** 3,000 emails/month, 100/day
- **Integration:** Direct REST API (no SDK — keeps bundle clean)
- **Webhook:** Resend delivers open/click/bounce/complaint events to `/api/email/webhooks`
- **Upgrade trigger:** Daily sends consistently hitting 80 emails/day → switch to Resend Pro ($20/mo, 50k/month)

### 5.2 Sender Configuration

```
Transactional:  "PM Academy" <welcome@pmacademy.com>  Reply-To: support@pmacademy.com
Notifications:  "PM Academy" <learn@pmacademy.com>    Reply-To: support@pmacademy.com
Product/Admin:  "PM Academy" <news@pmacademy.com>     Reply-To: support@pmacademy.com
```

---

## 6. Multi-Channel Notification Engine (Email & In-App)

The event system is channel-agnostic. When `fireNotificationEvent()` runs, it logs the event and distributes the message payload to all active, user-permitted channels.

```
                  ┌───────────────┐
                  │ Learning Event│
                  └───────┬───────┘
                          │
            ┌─────────────▼─────────────┐
            │    Notification Router    │
            └─────────────┬─────────────┘
                          │
      ┌───────────────────┼───────────────────┐
      ▼                   ▼                   ▼
┌───────────┐       ┌───────────┐       ┌───────────┐
│   Email   │       │  In-App   │       │Push (Fut.)│
│ Pipeline  │       │ Pipeline  │       │ Pipeline  │
└───────────┘       └───────────┘       └───────────┘
```

### 6.1 In-App Notification System

In-App notifications provide an instant, frictionless way to alert learners about milestones, reviews, and leaderboard changes directly inside the application interface.

#### 6.1.1 UI Components

- **Notification Bell:** Fixed icon in the main layout topbar displaying a dynamic red badge with the unread count (e.g. `3`). Uses Supabase real-time subscription or polling fallback.
- **Notification Drawer/Center:** Slide-out drawer or drop-down panel containing a scrollable feed of the user's latest 50 notifications.
- **Interactive Toggles:**
  - **Read/Unread Indicator:** Visual dot on unread items. Clicking an item marks it read.
  - **Mark All Read:** Button at the top of the Notification Center to instantly mark all pending items read.
- **Deep Linking:** Every in-app notification supports a target action URL (`action_url`). Clicking the notification redirects the user to the correct workspace (e.g. clicking a review notification opens `/review`, clicking badge opens `/badges`).

#### 6.1.2 Notification Categories in UI

In-App notifications are styled differently based on category for quick scanning:
- 🏆 **Milestones:** XP levels, certificate completions. Features gold accents and animations.
- 🏅 **Badges:** Earned badge details. Highlights the badge icon.
- 📚 **Learning:** Flashcard review due, new lesson unlocks. Features blue accent.
- ⚡ **Streaks:** At-risk streak alerts. Features orange/fire accents.
- 📣 **System:** Feature updates, downtime. Features green or neutral accents.

#### 6.1.3 Data Expiration & Clean-up

In-App notifications do not live forever. To maintain light database size and fast query speeds:
- Read notifications are deleted automatically after **14 days**.
- Unread notifications expire and are deleted after **45 days**.
- Clean-up is processed automatically by the daily `/api/cron/cleanup` database job.

#### 6.1.4 Mobile Compatibility

The table structure includes a JSON payload block and channel attributes designed to interface directly with Expo/FCM push tokens. When mobile applications are introduced in Phase 5, the API will output the exact same notification collection formatted as JSON for mobile push payloads.

---

## 7. Queue Architecture & Priority Matrix

### 7.1 Notification Priority Matrix

To manage limits, delivery speeds, and retries, all system communications are mapped to a Priority Matrix.

| Priority | Level | Examples | Default Channels | Queue Priority | Retry Policy | Rate Limits | Bypass Rules |
|----------|-------|----------|------------------|----------------|--------------|-------------|--------------|
| **Critical** | 1 | Suspicious login, password reset, security alert | Email + In-App | Immediate | Max 5 retries, 1m initial delay | None | Bypasses all user opt-out preferences and global rate caps |
| **High** | 2 | Certificate generated, level up, welcome email | Email + In-App | High | Max 3 retries, 5m initial delay | None | Bypasses daily caps; respects opt-out preferences |
| **Medium** | 5 | Badge earned, module complete, capstone submit | Email + In-App | Normal | Max 3 retries, 15m initial delay | Max 3/day per category | Respects all preferences and category rate limits |
| **Low** | 8 | Daily reminders, streak warning, cards due | In-App (Email if set) | Low | Max 2 retries, 1h initial delay | Max 1/day per category | Respects all rate limits; deferred if global budget is tight |
| **Bulk** | 10 | Admin broadcast, newsletter, surveys | Email | Idle | Max 1 retry, 4h initial delay | Max 1/week | Strictly throttled to process only during low-traffic hours (2 AM-5 AM UTC) |

### 7.2 Queue Processing Mechanics

The queue processor parses and executes pending entries based on Priority values:
1. **Priority Ordering:** The database query fetches rows ordered by `priority ASC, created_at ASC`. Critical and High priority rows are processed first.
2. **Selective Locking:** The processor uses `SELECT FOR UPDATE SKIP LOCKED` on the filtered batch to ensure multiple serverless execution threads do not lock the same rows.
3. **Throttling & Deferrals:** Low and Bulk priority rows are skipped if the global daily usage limit is within 10% of the Resend free tier cap, deferring them to the next day.

---

## 8. Scheduler Architecture

### 8.1 Provider-Agnostic Scheduler Abstraction

Scheduled background tasks are managed via a provider-agnostic scheduler abstraction. Business logic and queue processing do not depend on any specific platform (such as Vercel Cron, GitHub Actions, or Supabase Scheduled Functions).

The runtime feature flag controlling scheduled background execution is named `SCHEDULER_ENABLED`.

All scheduled tasks invoke system cron API routes via HTTP `POST` requests secured with `Authorization: Bearer ${CRON_SECRET}`:

| Route Endpoint | Default Frequency | Purpose |
|----------------|-------------------|---------|
| `/api/cron/process-email-queue` | Every 15 min | Processes pending queue items ordered by priority |
| `/api/cron/retry-failed` | Every 1 hour | Retries failed emails using exponential backoff |
| `/api/cron/weekly-recap` | Weekly trigger | Evaluates timezone-eligible learners and queues weekly recaps |
| `/api/cron/cleanup` | Daily 02:00 UTC | Purges expired in-app notifications (>14d) & queue logs |

### 8.2 Timezone-Aware Weekly Recap Evaluator

The weekly recap schedule is **timezone-aware**. Rather than broadcasting to all users simultaneously at a static UTC hour:

1. The scheduler invokes `/api/cron/weekly-recap` periodically (e.g. weekly or daily).
2. The endpoint evaluates each learner against `isUserEligibleForWeeklyRecap()` based on:
   - `userPreferences.timezone` (e.g., `'America/New_York'`, `'Asia/Kolkata'`, `'UTC'`)
   - `userPreferences.preferredRecapDay` (0 = Sunday, 1 = Monday, ..., 6 = Saturday; default: `0`)
   - `userPreferences.preferredRecapHour` (0-23 local hour; default: `18` / 6 PM local)
3. Only learners whose local day and hour match their preferred window (within a configurable tolerance) are queued for recap generation.

This allows swapping the underlying runner (GitHub Actions workflow, AWS EventBridge, Supabase Cron, etc.) without altering any core notification or timezone business logic.

---

## 9. Retry Strategy

### 9.1 Exponential Backoff

```typescript
function calculateNextRetryAt(attemptCount: number, priority: number): Date {
  // Base delays in minutes per priority level
  const baseDelays: Record<number, number[]> = {
    1: [1, 5, 15, 30, 60], // Critical
    2: [5, 15, 60],        // High
    5: [15, 60, 180],      // Medium
    8: [60, 360],          // Low
    10: [240]              // Bulk
  }
  const delays = baseDelays[priority] ?? [15, 60, 180]
  const delayMinutes = delays[attemptCount] ?? 180
  return new Date(Date.now() + delayMinutes * 60 * 1000)
}
```

---

## 10. Rate Limiting

To prevent notification fatigue, the router checks categories against daily user limits. This does not block **Critical** or **High** priority events.

---

## 11. User Notification Preferences

Preferences control which events compile to specific channels. Opt-ins are verified at routing time.

```sql
user_notification_preferences (
  user_id                       uuid primary key references users(id) on delete cascade,
  all_notifications             boolean not null default true,
  all_email                     boolean not null default true,
  all_in_app                    boolean not null default true,
  
  -- Category channels
  daily_reminder_email          boolean not null default true,
  daily_reminder_in_app         boolean not null default true,
  weekly_recap_email            boolean not null default true,
  weekly_recap_in_app           boolean not null default true,
  badge_email                   boolean not null default true,
  badge_in_app                  boolean not null default true,
  
  preferred_reminder_hour       int not null default 9,
  timezone                      text not null default 'UTC',
  unsubscribe_token             text unique,
  updated_at                    timestamptz not null default now()
);
```

---

## 12. Template System, Versioning & Feature Flags

### 12.1 Template Versioning Design

To prevent broken analytics and historical layout drift, email and in-app templates are strictly versioned. 

#### 12.1.1 Schema Structure

```sql
notification_templates (
  id                uuid primary key default gen_random_uuid(),
  template_key      text unique not null,              -- e.g. 'achievement.badge_earned'
  category          text not null,
  current_version   int not null default 1,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

notification_template_versions (
  id                uuid primary key default gen_random_uuid(),
  template_id       uuid references notification_templates(id) on delete cascade,
  version           int not null,                      -- incrementing version number
  subject_line      text not null,                     -- subject with variables
  body_text         text not null,                     -- plaintext fallback template
  body_html         text not null,                     -- compiled React Email HTML markup
  status            text not null default 'draft',     -- 'draft' | 'active' | 'deprecated'
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (template_id, version)
);
```

#### 12.1.2 Non-Breaking Version Introductions

1. **Deploying New Code:** React Email templates are defined in code. When changes are made, the code supports both the old rendering path (for backward compatibility during rolling deployments) and the new version.
2. **Database Tracking:** The `email_queue` references both the `template_key` and the resolved `template_version`. When rendering, the system retrieves the specific HTML schema compiled for that version number.
3. **Rollback Support:** An administrator can toggle the `current_version` back to a previous active version number in the Admin Console. The queue processor will instantly resolve requests to the designated rollback version without requiring an application build or deploy.

### 12.2 Feature Flag System

Feature flags provide real-time runtime control over the notification pipeline.

#### 12.2.1 Architecture & Storage

Flags are stored in PostgreSQL (`notification_feature_flags`) and cached in-memory on the application server for **5 minutes** to prevent database query overhead during event spikes.

```sql
notification_feature_flags (
  key               text primary key,                   -- e.g. 'gate.email.badge_earned'
  description       text,
  enabled           boolean not null default true,
  updated_at        timestamptz not null default now()
);
```

#### 12.2.2 Gate Controls

The system validates active flags at two levels:
- **Event Gates:** e.g., `gate.category.achievements`. If disabled, incoming events under the category are immediately discarded, logging a status of `skipped_by_flag` in `notification_events`.
- **System Gates:** e.g., `gate.system.queue_processing`, `gate.system.cron_reminders`. If disabled, cron triggers return immediately, pausing all queue consumption.

#### 12.2.3 Fail-Safe Behavior

If the feature flag store or database is unreachable, the system defaults to a **fail-safe local mode**:
- **Critical & High** priority events are allowed to send.
- **Medium & Low** priority crons are paused.
- **All template keys** default to `enabled: true`.

---

## 13. Analytics & User Notification Timeline

### 13.1 User Notification Timeline

For support and debugging, the system maintains a unified chronological ledger of all user notifications across all channels in the `user_notification_timeline` table.

```sql
user_notification_timeline (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references users(id) on delete cascade not null,
  event_id          uuid references notification_events(id),
  channel           text not null,                     -- 'email' | 'in_app' | 'push'
  template_key      text not null,
  template_version  int not null,
  status            text not null,                     -- 'queued' | 'delivered' | 'opened' | 'clicked' | 'failed' | 'suppressed'
  priority          int not null,
  
  -- Tracking Timestamps
  queued_at         timestamptz not null default now(),
  sent_at           timestamptz,
  delivered_at      timestamptz,
  opened_at         timestamptz,
  clicked_at        timestamptz,
  failed_at         timestamptz,
  suppressed_at     timestamptz,
  
  error_details     text,
  resend_id         text,
  created_at        timestamptz not null default now()
);
```

#### 13.1.1 Tracing and Correlation

Every timeline entry includes an `event_id` referencing the raw event log. This allows an administrator to trace an email or in-app card back to the exact action that triggered it (e.g. verifying which quiz attempt triggered a specific badge).

---

## 14. Monitoring & System Health Dashboard

### 14.1 System Health Metrics

The following metrics are compiled via real-time aggregation queries and displayed on the Admin System Health panel:

- **Queue Health:** Measured by checking database latency between `scheduled_at` and `delivered_at`. Healthy latency is under **15 minutes**.
- **Average Processing Time:** Tracking speed of Resend API dispatch. Healthy duration is under **800ms**.
- **Failure & Retry Rate:** Percentage of events moving to `failed` or `dead_letter` states over a rolling 24-hour window.
- **Cron Health:** Tracks the timestamp of the last executed cron cron job. Warning states activate if any job misses its schedule by more than **2 intervals**.

### 14.2 Threshold Alert Matrix

| Metric | Warning Threshold | Critical Threshold | Action Plan |
|---|---|---|---|
| **Queue Latency** | > 15 minutes | > 30 minutes | Warning: trigger alert email to Admin. Critical: Pause queue, check Resend status page. |
| **Dead Letter Rate** | > 2% of 24h sends | > 5% of 24h sends | Critical: Halt related template sends instantly via Feature Flags; check template version schemas. |
| **Provider Status (Resend)** | > 5% API errors | > 10% API errors | Switch system to fallback local queue; defer non-critical mails. |
| **Daily Send Cap** | > 80 sends | > 95 sends | Warning: Pause all Bulk priority queues. Critical: Block Medium priority queue. |

---

## 15. Security

Key management, Svix signature validation on webhook endpoints, and strict RLS scoping apply to all database models.

---

## 16. Local Development

Refer to `docs/Notification-Architecture.md` Section 16 for preview server configurations.

---

## 17. Deployment

Ensure `CRON_SECRET` and `EMAIL_WEBHOOK_SECRET` are synchronized in the Vercel dashboard.

---

## 18. Scaling Strategy

As volume grows past 10,000 active users, move queue workers from hourly crons to edge-based task queues or Upstash Redis pools.

---

## 19. Disaster Recovery

Follow recovery guidelines in Section 19 of the architecture blueprint.

---

## 20. Admin Console Architecture (/admin)

To replace isolated admin tools, PM Academy uses a unified, modular **Admin Console** dashboard routed under `/admin`. 

```
┌────────────────────────────────────────────────────────────────────────┐
│                              Admin Console                             │
├───────────────┬────────────────────────────────────────────────────────┤
│ Side Nav      │ Content Workspace                                      │
├───────────────┼────────────────────────────────────────────────────────┤
│ Dashboard     │ Modules & Metrics overview                             │
│ Users         │ User lists, profiles, timelines                        │
│ Notifications │ Feature flags, In-App Center                           │
│ Emails        │ Email queue, suppressions, logs                        │
│ Analytics     │ Activity metrics & aggregate charts                    │
│ Content       │ Lesson curriculum mapping                              │
│ Certificates  │ Issued verification lookup                             │
│ Portfolios    │ Public page approvals                                  │
│ Leaderboards  │ Active cohorts & user points override                  │
│ System        │ Health status dashboard, system settings                │
└───────────────┴────────────────────────────────────────────────────────┘
```

### 20.1 Console Modules

1. **Dashboard:** Consolidated analytics showing registration trends, daily active users, average XP gain, and completion rates.
2. **Users:** Admin lookup to inspect user records, view current levels/streaks, and check individual **Notification Timelines** for debugging.
3. **Notifications:**
   - **In-App Center:** Log view of in-app items.
   - **Feature Flags:** Simple checkbox matrix to enable/disable flags in real-time.
4. **Emails:** Access to the `email_queue` manager, template editor, suppression lists, and raw Resend webhook logs.
5. **Analytics:** Performance metrics and deliverability charts.
6. **Content:** View and update curriculum metadata graphs without source code modifications.
7. **Certificates:** Revocation and manual issuance controls for certificates.
8. **Portfolios:** Moderation panel to review reported public portfolio profiles.
9. **Leaderboards:** Active cohort manager, points monitoring, and audit log tools.
10. **System:** **System Health Dashboard** displays cron success dates, rate usage charts, and provider statuses.

### 20.2 Modular Extension Guidelines

Every module in `/admin` follows a standardized layout:
- UI components load dynamically using Next.js `React.lazy` to keep the initial admin chunk bundle minimal.
- All administration endpoints verify credentials using the same server-side admin check helper.
- New modules register by adding their route config to the sidebar array in `app/(admin)/layout.tsx`.

---

## 21. Developer Experience

Procedures for adding templates and testing workflows are detailed in Section 21.

---

## 22. Database Design

### 22.1 Migration Sequence

```
20260806000001_create_notification_preferences.sql
  - user_notification_preferences table
  - ADD COLUMN users.is_admin boolean not null default false

20260806000002_create_email_queue.sql
  - email_queue table
  - email_dead_letter table
  - in_app_notifications table

20260806000003_create_notification_events.sql
  - notification_events table
  - email_delivery_events table
  - email_suppressions table

20260806000004_create_system_settings.sql
  - system_settings table
  - notification_feature_flags table
  - notification_templates table
  - notification_template_versions table
  - user_notification_timeline table

20260806000005_add_notification_rls_policies.sql
  - RLS rules: scope preferences to user_id, restrict logs to admin role
```

### 22.2 Table Schemas for Additions

#### In-App Notifications

```sql
CREATE TABLE in_app_notifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references users(id) on delete cascade not null,
  event_id      uuid references notification_events(id),
  category      text not null,                         -- 'milestone' | 'badge' | 'learning' | 'streak' | 'system'
  title         text not null,
  body          text not null,
  action_url    text,                                  -- deep link destination
  priority      int not null default 5,                -- 1=critical, 5=medium, 8=low
  is_read       boolean not null default false,
  read_at       timestamptz,
  expires_at    timestamptz not null,                  -- deletion date
  created_at    timestamptz not null default now()
);
```

#### Feature Flags

```sql
CREATE TABLE notification_feature_flags (
  key           text primary key,
  description   text,
  enabled       boolean not null default true,
  updated_at    timestamptz not null default now()
);
```

#### User Notification Timeline

```sql
CREATE TABLE user_notification_timeline (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references users(id) on delete cascade not null,
  event_id          uuid references notification_events(id) on delete set null,
  channel           text not null,                     -- 'email' | 'in_app' | 'push'
  template_key      text not null,
  template_version  int not null,
  status            text not null,                     -- 'queued' | 'delivered' | 'opened' | 'clicked' | 'failed' | 'suppressed'
  priority          int not null,
  queued_at         timestamptz not null default now(),
  sent_at           timestamptz,
  delivered_at      timestamptz,
  opened_at         timestamptz,
  clicked_at        timestamptz,
  failed_at         timestamptz,
  suppressed_at     timestamptz,
  error_details     text,
  resend_id         text,
  created_at        timestamptz not null default now()
);
```

---

## 23. Future Expansion

Expansion pathways are mapped in Section 23 of the core spec.

---

## 24. Sprint 6 Implementation Roadmap

Refer to Section 24 for the 5-week roadmap timeline and complete Definition of Done.

---

## Changelog

- v1.1 — 2026-08-05: Integrated critical architectural enhancements requested before implementation: first-class In-App Notification Center and database schema, consolidated Notification Priority Matrix (Critical to Bulk channels and policies), modular Admin Console architecture (/admin) replacing the standalone center, database-backed Feature Flags with failsafes, template versioning schemas with rollback capabilities, User Notification Timeline tracking, and comprehensive System Health monitoring matrix.
- v1.0 — 2026-08-05: Initial design. Complete event-driven notification architecture covering 30+ typed learning events, 25+ email templates across 6 categories, PostgreSQL queue with priority levels and dead-letter handling, Vercel cron scheduler with timezone-aware delivery, exponential backoff retry strategy, per-user and global rate limiting, full notification preference model, React Email template system with shared design tokens, Admin Notification Center specification (6 views), database schema with critical indexes and RLS policies, and 5-week Sprint 6 implementation roadmap with P0/P1/P2 priorities and a complete Definition of Done.
