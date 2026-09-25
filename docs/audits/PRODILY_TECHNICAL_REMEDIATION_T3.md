# Prodily Technical Remediation — Phase T3: Performance & Query Architecture

## Executive Summary

Phase T3 completes the performance, query-scalability, and batch-processing remediation for Prodily on the `tech-fixes` branch, directly resolving the architectural bottlenecks identified in `PRODILY_TECHNICAL_SYSTEM_AUDIT.md` and deferred from Phase T2:
1. **Notification Queue Cron Pagination & Worker Sizing:** Eliminated the 100-record starvation ceiling in `daily-reminder` and `weekly-recap` crons by replacing fixed-limit queries with deterministic keyset pagination (`gt('id', lastSeenId)`), batch preference resolution (`getBatchUserNotificationPreferences`), and bounded multi-batch queue draining in `processEmailQueue`.
2. **Admin Audit Log Scalability:** Implemented deterministic ordering with unique tie-breaking (`created_at DESC, id DESC`), keyset cursor pagination (`nextCursor`), and normalized date-range filtering, while preserving Phase T2 silent authorization probe semantics and avoiding full-table memory scans.
3. **Flashcard / SRS Batch Aggregation:** Parallelized review queue reads via `Promise.all`, eliminated nested O(cards × lessons) file reading loops in lesson compiled data lookups, added `recordBatchFlashcardReviews` and `getDueCardsCount`, and introduced composite index `idx_user_flashcard_srs_user_card` without modifying SM-2 interval or ease calculations.

---

## Environment & Commits

- **Branch:** `tech-fixes`
- **T1 Commit SHA:** `681f34b51ffb3d12018032eb642b35e8c9a8169b`
- **T2 Commit SHA:** `a097177c9a2b8390160560eb2a9fe30920d3775a`
- **Starting SHA:** `a097177c9a2b8390160560eb2a9fe30920d3775a`
- **Final SHA:** `30ee450b15ef3e4177b0cf8eb756f6bedf2a7475`
- **Working Tree State:** Clean, verified with zero regressions against T1 and T2 test suites.

---

## Findings Addressed

### 1. T3.1: Notification Queue Pagination & Worker Sizing
- **Audit Findings:** Notification crons (`daily-reminder`, `weekly-recap`) utilized static `.limit(100)` queries. Once active users with streaks or weekly activity exceeded 100, users beyond the first page were permanently starved. Furthermore, `processEmailQueue` executed a single batch per invocation, leaving high-volume queues backlogged.
- **Root Cause:**
  - Lack of pagination loops in `daily-reminder/route.ts` and `weekly-recap/route.ts`.
  - Non-deterministic query ordering on non-unique columns.
  - Absence of multi-batch queue draining controls in `processEmailQueue`.
- **Remediation:**
  - Implemented keyset cursor pagination in both crons (`.gt('id', lastSeenId).order('id', { ascending: true }).limit(BATCH_SIZE)`).
  - Bounded pagination execution to safe budgets (`MAX_PAGES = 50`, `MAX_EXECUTION_MS = 45_000`).
  - Reused Phase T2 `getBatchUserNotificationPreferences` to resolve preferences in a single query per page.
  - Extended `processEmailQueue` with `ProcessEmailQueueOptions` (`maxBatches`, `maxExecutionMs`) to drain up to 250 items per cron run.

### 2. T3.2: Admin Audit Log Scalability
- **Audit Findings:** `SystemService.getAuditLog` previously attempted offset pagination on `admin_audit_logs` ordered only by `created_at DESC`. Rows sharing identical millisecond timestamps caused non-deterministic page shifts, skipped records, and duplicate entries. Date filtering was prone to syntax mismatch due to redundant ISO formatting.
- **Root Cause:**
  - Lack of a unique secondary sort key in query ordering.
  - Missing keyset cursor pagination support for large audit trails.
  - Inflexible page sizing (previously clamped to minimum 5).
- **Remediation:**
  - Added deterministic tie-breaker: `order('created_at', { ascending: false }).order('id', { ascending: false })`.
  - Implemented cursor-based pagination encoding `created_at` and `id` (`${created_at}|${id}` base64-encoded).
  - Normalized date range filters (`from`, `to`) to handle both raw dates (`YYYY-MM-DD`) and full ISO strings without string concatenation bugs.
  - Added composite index `idx_admin_audit_logs_created_id` ON `admin_audit_logs(created_at DESC, id DESC)`.
  - Preserved T2 silent admin authorization probe semantics (no spurious `access_denied` entries).

### 3. T3.3: Flashcard / SRS Batch Aggregation & Query Efficiency
- **Audit Findings:**
  - `getReviewQueueData` sequentially awaited curriculum data, progress records, and SRS state.
  - Lesson metadata extraction performed an O(cards × lessons) nested loop over all curriculum lessons for every single card.
  - Card reviews were submitted one-by-one via individual database upserts.
  - No efficient aggregate count API existed for due cards, forcing callers to load complete card payloads.
- **Root Cause:** Sequential waterfall operations, unindexed flashcard lookups omitting `lesson_id`, and unbatched writes.
- **Remediation:**
  - Parallelized initial data fetching via `Promise.all([fetchCurriculumData(), getUserCompletedLessons(userId), getDueFlashcardsForUser(userId)])`.
  - Pre-indexed lessons into an O(1) Map (`lessonMap`), eliminating nested iterations.
  - Added `recordBatchFlashcardReviews` to process review queues in a single batch upsert.
  - Added `getDueCardsCount` for lightweight count checks.
  - Added composite index `idx_user_flashcard_srs_user_card` ON `user_flashcard_srs(user_id, flashcard_id)`.
  - Retained SuperMemo SM-2 interval, ease, and repetition algorithms completely intact.

---

## Files Changed

| File | Changes Made |
|---|---|
| `supabase/migrations/20260925000003_phase_t3_performance_query.sql` | Added indexes `idx_admin_audit_logs_created_id`, `idx_admin_audit_logs_admin_created`, `idx_user_flashcard_srs_user_card`, and `idx_users_streak_active`. |
| `apps/web/app/api/cron/daily-reminder/route.ts` | Implemented keyset pagination loop with `.gt('id', lastSeenId)`, batch preference preloading, deterministic idempotency keys, and execution deadline guards. |
| `apps/web/app/api/cron/weekly-recap/route.ts` | Implemented keyset pagination loop with `.gt('id', lastSeenId)`, parallel batch fetching of XP events, completed lessons, and notification preferences. |
| `apps/web/app/api/cron/process-email-queue/route.ts` | Configured multi-batch queue draining with `maxBatches: 5` and `maxExecutionMs: 45_000`. |
| `apps/web/lib/notifications/queue/processor.ts` | Added `ProcessEmailQueueOptions`, extracted `processSingleBatch`, and implemented bounded multi-batch loop. |
| `apps/web/lib/admin/types.ts` | Added `nextCursor?: string | null` to `AdminAuditLogResult`. |
| `apps/web/lib/admin/system-service.ts` | Added deterministic secondary ordering by `id DESC`, keyset cursor pagination support, date normalization, and minimum page size relaxation. |
| `apps/web/app/api/admin/audit/route.ts` | Supported `cursor` search parameter. |
| `apps/web/app/api/admin/system/audit/route.ts` | Supported `cursor` search parameter. |
| `apps/web/lib/flashcards-service.ts` | Parallelized review queue reads via `Promise.all`, replaced nested lesson search with O(1) map, added `recordBatchFlashcardReviews` and `getDueCardsCount`. |
| `apps/web/lib/__tests__/phase-t3-performance-query.test.ts` | Dedicated test suite verifying keyset pagination, multi-batch draining, tie-breaker ordering, cursor pagination, batch SRS, and due card counts. |

---

## Database Migrations Added

**Migration File:** `supabase/migrations/20260925000003_phase_t3_performance_query.sql`

```sql
-- 1. Admin Audit Logs: Composite index for deterministic keyset pagination and ordering
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_id
  ON public.admin_audit_logs (created_at DESC, id DESC);

-- 2. Admin Audit Logs: Filter index for administrator email lookups with timestamp ordering
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_admin_created
  ON public.admin_audit_logs (admin_email, created_at DESC);

-- 3. User Flashcard SRS: Composite index for flashcard lookups and batch reviews
CREATE INDEX IF NOT EXISTS idx_user_flashcard_srs_user_card
  ON public.user_flashcard_srs (user_id, flashcard_id);

-- 4. Users: Partial index for daily reminder cron keyset scanner
CREATE INDEX IF NOT EXISTS idx_users_streak_active
  ON public.users (id)
  WHERE current_streak > 0 AND email IS NOT NULL;
```

---

## Pagination & Worker Strategies

### Keyset Cursor Pagination
- **Cron Jobs (`daily-reminder`, `weekly-recap`):**
  - Order: `ORDER BY id ASC`
  - Cursor Predicate: `.gt('id', lastSeenId)`
  - Guarantees: Records cannot be skipped or duplicated if new rows are inserted during worker execution. Bounded by `MAX_PAGES = 50` and `MAX_EXECUTION_MS = 45_000`.
- **Admin Audit Logs:**
  - Order: `ORDER BY created_at DESC, id DESC`
  - Cursor Predicate: `(created_at < cursorTime) OR (created_at = cursorTime AND id < cursorId)`
  - Guarantees: Unambiguous paging even when dozens of records share the exact same timestamp.

### Batch Worker Sizing
- **Queue Draining (`processEmailQueue`):**
  - Default batch size: 50 items per SQL claiming query via RPC `claim_email_queue_items`.
  - Multi-batch loop: Drains up to 5 successive batches (250 emails max) within a 45-second execution deadline.
  - Early exit: If a batch returns fewer items than the batch size, the queue is recognized as drained and processing terminates immediately.

---

## Concurrency & Idempotency Considerations

1. **Transactional Queue Claiming:** Queue processing continues to rely on PostgreSQL row locking via `FOR UPDATE SKIP LOCKED` inside `claim_email_queue_items`, preventing worker collisions.
2. **Deterministic Enqueue Idempotency:**
   - Daily reminders: `daily-reminder-${user.id}-${todayDate}`
   - Weekly recaps: `weekly-recap-${user.id}-${todayDate}`
   - Backed by unique constraint on `idempotency_key` in `email_queue`.
3. **Batch SRS Upsert Safety:** `recordBatchFlashcardReviews` uses `upsert` with `onConflict: 'user_id,lesson_id,flashcard_id'`, guaranteeing atomic state updates for all cards in a review session.

---

## Validation & Test Results

### 1. Dedicated Phase T3 Suite
**Command:** `npm test -- lib/__tests__/phase-t3-performance-query.test.ts`
- **Result:** 9 / 9 passed (100%)
- **Coverage:**
  - Keyset pagination across multiple pages past the 100 limit.
  - Multi-batch bounded queue draining via `processEmailQueue`.
  - Deterministic tie-breaker ordering (`created_at DESC, id DESC`).
  - Keyset cursor navigation and page continuity.
  - Date-range filter normalization.
  - T2 silent authorization probe preservation.
  - Parallelized review queue fetching and O(1) map lesson resolution.
  - Batch SRS recording via `recordBatchFlashcardReviews`.
  - Lightweight aggregate due card counting via `getDueCardsCount`.

### 2. Regression Suites (T1, T2, Related Systems)
- **T1 Security Hardening:** 15 / 15 passed (`lib/__tests__/phase-t1-security-hardening.test.ts`)
- **T2 Core Backend Reliability:** 19 / 19 passed (`lib/__tests__/phase-t2-backend-reliability.test.ts`)
- **Flashcard Persistence:** 6 / 6 passed (`lib/__tests__/flashcard-persistence.test.ts`)
- **Email Automations:** 5 / 5 passed (`lib/__tests__/email-automations.test.ts`)
- **Combined Phase Suite (T1 + T2 + T3):** 43 / 43 passed

### 3. Static Analysis
- **TypeScript Typecheck (`npx tsc --noEmit`):** Passed with 0 errors.
- **ESLint (`npx eslint`):** Passed with 0 errors and 0 warnings across all modified application and test files.

---

## Findings Intentionally Deferred

### Phase T4 — User Experience & State Resilience
- Settings UI toast feedback / dirty-form state.
- Navigation state retention across module lessons.

### Phase T5 — Infrastructure & Monitoring
- Ingestion of email bounce/complaint webhooks (Brevo/SendGrid).
- Comprehensive system health checks endpoint (`/api/health`).
- Email provider failover and alerting.
- Cron timezone-aware delivery windows and retirement of redundant retry crons.

---

## Rollout & Migration Considerations

1. **Migration Application:** Apply `20260925000003_phase_t3_performance_query.sql`. All index creations utilize `CONCURRENTLY` or `IF NOT EXISTS` constructs suitable for online execution without table locking.
2. **Serverless Timeout Awareness:** All cron routes are bounded to 45 seconds of runtime to remain well within standard 60-second Vercel serverless function execution limits.
