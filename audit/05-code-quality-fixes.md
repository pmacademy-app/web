# Prodily — Code Quality & Required Fixes

**Date:** 2026-10-17 · **Commit:** `d43e3f2` (origin/main, clean tree) · **Scope:** `web/apps/web`
**Auditor topic:** code below standard, with line-level fixes. Security, perf/architecture, UI/UX, SEO and product are covered by other auditors and are only mentioned in passing here.

---

## Scope & method

- Ran the project's own gates from `apps/web` (`tsc --noEmit`, `eslint .`, `vitest run`). No build, no dev server, no installs, no repo edits.
- Read the standards first: `AGENTS.md`, `apps/web/AGENTS.md`, `docs/RULES.md`, `docs/DESIGN_SYSTEM.md`, `docs/API_CONTRACT.md`, `.tokencap/agent/rules.md` and `review-rules.md`, plus the in-code contracts the team wrote for itself (`lib/api/with-route.ts`, `lib/errors/api-response.ts`, `lib/db/index.ts`, `lib/db/pagination.ts`, `eslint.config.mjs`).
- Hunted by risk: streak/XP/date logic, lesson and quiz completion, the email queue and campaign paths, capstone autosave, client hooks, API route error handling, then type-safety escape hatches, React/Next patterns, duplication, dead code and tests.
- Every finding below cites a file and line I actually read. Counts that come from grep are labelled as such. Anything I could not fully prove is marked **(verify)**.

---

## Gate results

| Gate | Command | Result | Detail |
|---|---|---|---|
| Typecheck | `npx tsc --noEmit` | **Pass** (exit 0) | 0 errors under `strict: true`. |
| Lint | `npx eslint . --max-warnings=999999` | **Pass** (exit 0) | 0 errors, **45 warnings** in 24 files (22 in app code, 23 in tests). 1,062 files linted. Breakdown: 40 `no-unused-vars`, 2 `react-hooks/exhaustive-deps`, 1 `no-img-element`, 1 `no-location-assign-relative-destination`, 1 `no-anonymous-default-export`. |
| Unit tests | `npx vitest run` | **Fail** (exit 1) | 267 files, 3,858 tests: **3,857 passed, 1 failed**, 390 s. Not an env-var problem. |

**The failing test.** `components/__tests__/fellow-history-ui.test.tsx:138` calls `CSS.escape(...)`. jsdom has no `CSS` global, so it throws `TypeError: Cannot read properties of undefined (reading 'escape')`. The bug is in the test, not the product, but it means `main` does not meet `docs/RULES.md §3` ("Never claim a task is resolved without concrete build and test output verification"). Fix in CQ-31.

**Non-test lint warnings worth acting on** (the rest are unused imports):
- `components/admin/AdminLeaderboardView.tsx:32`: `setData` is never used, so `data` is just a prop copied into state. Delete the state.
- `blocks/section/InlineConceptCheck.tsx:12`: the `conceptTitle` prop is accepted and never rendered, so callers passing it get no error and no effect.
- `components/admin/AdminSystemAlertsView.tsx:97`: `alerts` is a new `[]` on every render, which defeats the two `useMemo`s below it (CQ-22).
- `lib/campaigns/portfolio-activation-runner.ts:13-16`: unused `path`, `fs` and `maskEmail` imports, left over from an earlier version.

---

## Scorecard

| Dimension | Score | Why |
|---|---:|---|
| Correctness | **5** | The pure streak and XP logic is sound and tested. The DB-facing code around it has real defects: a wrong day-length constant, compliance gates that let mail through when a read fails, PostgREST truncation in a campaign path, a quiz RPC error that is swallowed silently, and an autosave that drops the last edits. |
| Type safety | **5** | `tsc` is clean under strict mode, but 287 `as unknown as` casts and 24 local `DBChain` fake types still erase the generated schema types. The team's own `lib/db/index.ts` names that pattern as the root cause of incident F-COR-1. There are 35 `any`, mostly where the generated types already exist. |
| React / Next practices | **6** | Good foundations: SWR on top of the typed client, and `withRoute`. Against that: a client page that fetches in `useEffect` and starts in the wrong state, side effects inside a state updater, a stale callback behind an `eslint-disable`, `toLocale*` and `Math.random` during SSR render, and about 20 unnecessary `"use client"` files. |
| Maintainability | **5** | Several files are over 1,000 lines (one component holds 24 `useState`s). Helpers are copied around (site URL ×51, `formatDateTime` ×5, `escapeHtml` ×3, two different `fetchAllRows`, two username validators). About 70 exports are unreferenced. |
| Consistency | **4** | API errors come in three envelope shapes. 39 raw `fetch('/api…')` calls sit beside 74 typed-client calls. 193 `console.error` calls compare with 52 `logSystemError` calls. Hook file names mix kebab-case and camelCase. |
| Test quality | **6** | 3,858 tests and good invariant coverage, but one test is red on `main`. About 266 assertions grep source text. In 12 suites the mocks make the code under test throw `TypeError`s that the assertions never notice. The streak DB layer, capstone autosave and the campaign runner have no tests. |
| Adherence to project rules | **5** | `RULES.md §2.3` (log every failure path via `logSystemError`, return correct status) is broken in about 54 admin routes and many services. Hooks live outside `hooks/`. `lib/` imports React and Next. The banned `DBChain` cast survives outside `lib/db/`. |
| **Overall** | **5.1 / 10** | Strong infrastructure that hasn't been adopted consistently. Most fixes below are small, mechanical changes that apply patterns the repo already contains. |

---

## Executive summary

- **The gates are nearly green, but `main` has one failing test** (a jsdom `CSS.escape` gap). Typecheck and lint pass with 0 errors.
- **Two safety gates on outbound mail let mail through when a read fails.** If the suppression check or the preferences read in `enqueueNotificationItem` fails, the email is queued anyway. The daily-reminder and weekly-recap crons never pass `strict`, so a failed preferences read treats opted-out learners as opted in (CQ-03). The portfolio-activation campaign reads suppressions and opt-outs with unbounded selects that PostgREST cuts at 1,000 rows, and checks auth-metadata opt-outs for only the first 50 users (CQ-02).
- **A one-digit typo corrupts the in-app weekly summary every evening.** `84600000` should be `86400000`. After 21:00 local time the 7-day activity map repeats one day and drops another, and "days studied" is overcounted (CQ-01).
- **Failures are routinely turned into success.** About 54 admin route handlers catch every exception themselves and return a 500 without recording an incident. Services underneath catch DB errors and return `[]`, so the admin UI shows "no data" with a 200 (CQ-06). The quiz RPC error is discarded and a non-atomic fallback path runs instead (CQ-05).
- **The team's own guardrails stop at the edge of `lib/db/`.** 24 files still declare `interface DBChain` and cast through it. Several of them drop the `error` field, which is the exact F-COR-1 failure mode (CQ-14; CQ-07 is a live example). The fix is already written (`lib/db`, `fetchAllRows`); it just needs to be used.
- **Client hooks have real bugs.** Capstone autosave drops the last 2.5 s of typing on navigation and calls `setState` from inside a state updater (CQ-08). The usage tracker calls a stale prompt callback (CQ-09). The capstone page shows an editable "unlocked" editor before its data loads (CQ-16).
- **Duplication is causing drift.** Onboarding and Settings validate usernames differently, and onboarding skips the reserved-word list, so `admin` is accepted there (CQ-24).
- **Tests miss failures that happen inside the code they run.** `dashboard.test.ts` passes while both of the loaders it exercises throw. About 266 assertions check source text rather than behaviour (CQ-32, CQ-33).

---

## Findings

Severity: **Critical** (data loss, compliance or security impact in production now) · **High** (user-visible wrong behaviour or a broken project rule on a hot path) · **Medium** · **Low**.
Effort: **S** (< 2 h) · **M** (half a day to 2 days) · **L** (> 2 days).

### A. Correctness

#### CQ-01 — Weekly summary uses a 23.5-hour "day"; streak read hides DB errors as "not started"
- **Severity:** High · **Effort:** S
- **Location:** `apps/web/lib/streaks/streaks-db.ts:212`, `:216`, `:155-166`, `:199-205`
- **Problem:**
  - `84600000` ms is 23.5 h, not 24 h (`86400000`). Each step back drifts 30 minutes. Simulated with UTC at 21:30 the window is `10-12, 10-13, 10-13, 10-14, …, 10-17`: 10-13 appears twice and 10-11 is missing. At 23:45 "today" appears twice.
  - `daysStudied` counts map entries, so the duplicated day is counted twice.
  - `sevenDaysAgoIso` (8 × 23.5 h) also makes `totalXpEarned` and `lessonsCompleted` cover about 7.8 days while the map shows 7.
  - `getUserStreakStatus` returns a fresh `not_started` summary when the profile read fails, so `/api/streaks` answers 200 "Start your first streak today" to a learner with a 40-day streak whenever the DB hiccups.
  - `getWeeklySummary` reads `users` a second time for the timezone that `getUserStreakStatus` already loaded.
  - None of this has a test.
- **Fix:**
```ts
// before (streaks-db.ts:210-216)
for (let i = 6; i >= 0; i--) {
  const d = new Date(now.getTime() - i * 84600000)
  past7Days.push(getLocalDateString(timezone, d))
}
const sevenDaysAgoIso = new Date(now.getTime() - 8 * 84600000).toISOString()

// after — step calendar days, not milliseconds, and bound queries to the same window
import { MS_PER_DAY } from '@/lib/time'            // new shared constant (see CQ-23)
const todayStr = getLocalDateString(timezone, now)
const past7Days = Array.from({ length: 7 }, (_, k) => {
  const d = new Date(`${todayStr}T12:00:00Z`)      // noon avoids DST edges
  d.setUTCDate(d.getUTCDate() - (6 - k))
  return d.toISOString().slice(0, 10)
})
const windowStartIso = new Date(now.getTime() - 8 * MS_PER_DAY).toISOString()
// …then count totalXpEarned / lessonsCompleted only for events whose local date ∈ past7Days
```
```ts
// before (streaks-db.ts:155)
if (profileError || !userProfile) { return { status: 'not_started', … } }
// after — let withRoute turn it into a 500 + incident
if (profileError) throw profileError
if (!userProfile) return NOT_STARTED_SUMMARY
```
  Add a Vitest case that pins `now` at 21:30 and 23:45 local and asserts seven distinct dates. Related: `app/api/cron/weekly-recap/route.ts:137-145` counts "days studied" by **UTC** date (`created_at.slice(0, 10)`) while the in-app summary uses local dates, so the email and the app disagree for non-UTC learners. Use `getLocalDateString(timezone, …)` there too.

#### CQ-02 — Portfolio-activation campaign: compliance reads are truncated, failed reads let mail through, and sends bypass the queue
- **Severity:** Critical · **Effort:** M
- **Location:** `apps/web/lib/campaigns/portfolio-activation-runner.ts:332-420`, `:401-411`, `:787-865`. Triggered from `lib/admin/broadcast-service.ts:509-518` for any scheduled broadcast with `template_key = 'marketing.portfolio_activation'`.
- **Problem:**
  - Only the `users` read checks `error` (line 337). The `email_suppressions` (380), `user_notification_preferences` (389), `email_queue` dedupe (415), `xp_events` (357) and `capstone_submissions` (368) reads all drop `error`. A failed suppression read therefore means *nobody is suppressed*.
  - Every one of those reads is unbounded. `supabase/config.toml` sets `max_rows = 1000`, so past 1,000 rows the result is silently truncated. `lib/db/pagination.ts:3-11` documents exactly this bug class (F-COR-2/F-COR-4).
  - `supabase.auth.admin.listUsers()` (401) is called without paging. GoTrue returns 50 users per page by default, so `marketing_opt_out` / `unsubscribed` metadata is honoured only for the first 50 accounts. The error is swallowed (`catch {}` at 409).
  - The per-candidate re-check (790) covers preferences only, not suppressions or auth metadata. It also lets mail through: if `pref` is `null` on error, the email is sent.
  - Mail goes out via `sendEmail()` directly (820), and a fake `status: 'delivered'` row is inserted into `email_queue` afterwards (834). The insert's error is ignored. This bypasses the queue's global pause, automation toggles, daily quota and suppression check, and conflicts with `RULES.md §2.1` (no parallel infrastructure) and `§2.4` (production sends go through `email_queue`).
  - 16 `as any` casts (lines 331-870) even though every table exists in `types/database.ts`.
- **Fix:** route the campaign through the existing broadcast path (`BroadcastService.executeBroadcastBatch` → `enqueueNotificationItem`), which already handles batching, dedupe and gating. If the bespoke audience logic must stay:
```ts
// before (runner.ts:379-381)
const { data: suppressionRows } = await (supabase.from('email_suppressions' as any) as any).select('email')

// after — typed client, every page read, errors fail the run
import { fetchAllRows } from '@/lib/db'
const suppressionRows = await fetchAllRows((from, to) =>
  supabase.from('email_suppressions').select('email').order('email').range(from, to))
```
```ts
// before (runner.ts:401)
const { data: authData } = await supabase.auth.admin.listUsers()
// after — walk every page; throw on error instead of silently skipping
for (let page = 1; ; page++) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
  if (error) throw error
  for (const au of data.users) { /* opt-out check */ }
  if (data.users.length < 1000) break
}
```
  Change the signature to `SupabaseClient<Database>` (or `Db` from `lib/db`) and delete all 16 `as any` casts and their `eslint-disable` lines.

#### CQ-03 — `enqueueNotificationItem` sends mail when the suppression or preferences read fails; crons don't pass `strict`
- **Severity:** High · **Effort:** S
- **Location:** `apps/web/lib/notifications/queue/processor.ts:110-126`, `:128-138`; `lib/notifications/preferences/defaults.ts:188-210`; `app/api/cron/daily-reminder/route.ts:120`; `app/api/cron/weekly-recap/route.ts:134`
- **Problem:**
  - The suppression lookup destructures only `data`. supabase-js does not throw on a DB error, so a failed read gives `data: null`, the address counts as not suppressed, and the email is queued.
  - `getResolvedUserNotificationPreferences` returns *defaults* (everything enabled) on error, with no logging.
  - `getBatchUserNotificationPreferences` has a `strict` mode whose docstring says "A bulk sender passes `strict`", but only `lib/growth/lifecycle-run.ts:178` does. The two cron senders pass the lenient result as `preloadedPreferences`, so enqueue never re-checks.
- **Fix:**
```ts
// before (processor.ts:113-118)
const { data: suppression } = await supabase.from('email_suppressions').select('id')
  .eq('email', params.toEmail.trim().toLowerCase()).maybeSingle()

// after — a failed read blocks non-critical mail
const { data: suppression, error: suppressionError } = await supabase
  .from('email_suppressions').select('id')
  .eq('email', params.toEmail.trim().toLowerCase()).maybeSingle()
if (suppressionError) {
  await logSystemError({ severity: 'error', category: 'queue', operation: 'enqueue.suppression_read',
    message: 'Suppression check failed; non-critical send skipped' })
  return { success: false, reason: 'Suppression check unavailable' }
}
```
```ts
// daily-reminder/route.ts:120 and weekly-recap/route.ts:134
const prefMap = await getBatchUserNotificationPreferences(supabase, userIds, { strict: true })
// and catch NotificationPreferencesReadError → skip this page, log, continue
```
  Give `getResolvedUserNotificationPreferences` the same `strict` option and use it from `enqueueNotificationItem`.

#### CQ-04 — Legacy `eventId` dedupe ignores `event_id` and still relies on `.maybeSingle()`
- **Severity:** Medium · **Effort:** S
- **Location:** `apps/web/lib/notifications/queue/processor.ts:165-183`
- **Problem:** the check matches `(user_id, template_key, event_type, status)` and never filters by `event_id`, although the column exists (`types/database.ts`, `email_queue.event_id`). The comment at `processor.ts:62-70` describes this exact defect ("once two rows existed the `.maybeSingle()` lookup errored, the error was discarded…"). It was fixed for `idempotencyKey` callers, but callers that pass only `eventId` still hit it:
  - `app/api/admin/emails/production-send/route.ts:152-160` (`event_type: 'admin.manual_trigger'`): an admin can send a given template to a given user once. The second send gets a 400 "Duplicate notification event" even though each call has a unique `eventId`.
  - `app/api/admin/emails/automations/run-now/route.ts:56,109`, and the `badge.earned`-style connectors that have no `idempotencyKey` (`lib/notifications/events/connectors.ts:90,215`).
  - With zero matching rows the insert goes through. With exactly one it is blocked. With two or more `.maybeSingle()` errors, the error is discarded, and the insert goes through again.
- **Fix:**
```ts
// before
.eq('event_type', params.eventType)
.in('status', ['pending', 'processing', 'delivered'])
.maybeSingle()
// after
.eq('event_id', params.eventId)
.in('status', ['pending', 'processing', 'delivered'])
.limit(1)
.maybeSingle()
```
  Better still, have every caller pass `idempotencyKey` and delete this branch.

#### CQ-05 — Quiz completion RPC errors are swallowed and a non-atomic fallback built for unit mocks runs in production
- **Severity:** High · **Effort:** S
- **Location:** `apps/web/lib/academy/lessons-db.ts:240-267`, `:269-330`
- **Problem:** `record_lesson_quiz_completion` is the atomic path. Any `rpcError`, malformed envelope or thrown exception sets `rpcSuccess = false` with no log (`catch { rpcSuccess = false }` at 265). The code then runs a JS fallback that its own comment describes as "when running in environments without the RPC (e.g. unit mocks)" (269): separate inserts, a read-then-award XP calculation and `completeLesson`. A transient error, statement timeout or bad migration therefore silently downgrades every quiz submission to a non-atomic path, and nobody is told. This breaks `RULES.md §2.3`. The fallback also re-implements `calculateQuizXp` (`lib/xp/xp.ts:274-295`), which production never calls (see CQ-33).
- **Fix:**
```ts
// before
} catch {
  rpcSuccess = false
}
if (!rpcSuccess) { /* non-atomic fallback */ }

// after — only fall back when the function genuinely does not exist; everything else is a fault
const RPC_MISSING = new Set(['PGRST202', '42883'])
const { data: rpcData, error: rpcError } = await supabase.rpc('record_lesson_quiz_completion', { … })
if (rpcError && !RPC_MISSING.has(rpcError.code ?? '')) throw rpcError   // withRoute → 500 + incident
if (rpcError) {
  await logErrorReport({ domain: 'db', kind: 'config_missing', operation: 'quiz.rpc_missing',
    summary: 'record_lesson_quiz_completion missing; using non-atomic fallback' })
  // fallback, using calculateQuizXp() instead of inline arithmetic
}
```
  Also type the parsed lesson the way line 161 of the same file already does: `const lesson = JSON.parse(raw) as CompiledLesson` (line 203 is currently `any`).

#### CQ-06 — Admin routes and services turn failures into 500s with no incident, or into 200 with empty data
- **Severity:** High · **Effort:** M (mechanical, many files)
- **Location (examples):** `apps/web/app/api/admin/emails/broadcasts/route.ts:20-52`, `:65-106`; `lib/admin/broadcast-service.ts:86-112`, `:117-131`; `lib/admin/service.ts:1259-1281`. Pattern counts (grep): 57 route files call `adminErrorMessage(`, and only 3 of them log. About 103 `catch` blocks in `lib/` return a default (`[]`, `null`, `{…}`, `0`, `false`), 63 of them in `lib/admin/`.
- **Problem:**
  - (a) Handlers already wrapped in `withRoute` add their own `try/catch` that returns `NextResponse.json({ error }, { status: 500 })`. The exception never reaches `withRoute`'s `apiInternalError`, so no incident row, no `errorId`, and an off-contract envelope (no `success`, `code` or `requestId`).
  - (b) Services such as `BroadcastService.listBroadcasts` catch the DB error, `console.error` it, and return `{ broadcasts: [], total: 0 }`. The route then answers **200** and the admin sees an empty list.
  - Both break `RULES.md §2.3` ("Every failure path must log … via `logSystemError()` and return appropriate HTTP status codes").
- **Fix:** delete the inner `try/catch` from wrapped handlers, and make services throw.
```ts
// before (broadcasts/route.ts)
async ({ request }) => {
  try {
    …
    return NextResponse.json({ success: true, ...body, data: result })
  } catch (err) {
    return NextResponse.json({ error: adminErrorMessage(err, 'Internal server error') }, { status: 500 })
  }
}
// after
async ({ request }) => {
  …
  return NextResponse.json({ success: true, ...body, data: result })
}   // withRoute already records the incident and returns the ADR-006 envelope

// before (broadcast-service.ts:108-111)
} catch (err) {
  console.error('[BroadcastService] listBroadcasts failed:', err)
  return { broadcasts: [], total: 0, page, pageSize, totalPages: 1 }
}
// after: remove the catch; `if (error) throw error` is already there
```
  If an admin screen really wants a partial page, return `{ …, failed: true }` the way `DashboardService.loadSlice` does (`lib/admin/dashboard-service.ts:232-340`). Never return a plain empty result. Add a lint rule (`no-restricted-syntax` on `CatchClause > BlockStatement > ReturnStatement` inside `app/api/**`) so new inner catches need a justification.

#### CQ-07 — Flashcard review queue discards query errors and counts "today" from an unbounded, unordered history
- **Severity:** Medium · **Effort:** S
- **Location:** `apps/web/lib/flashcards-service.ts:18-20`, `:43-64`, `:159-167`
- **Problem:** four parallel reads are cast through `DBChain` and only `.data` is read. A failed `user_flashcard_srs` read makes every card look new, and a failed `users` read silently falls back to UTC. `todayXpRes` (54-57) selects **every** `flashcard` XP event the user has ever earned, with no date filter and no order, then filters to today in JS. Past 1,000 events PostgREST truncates, typically to the oldest rows, so `completedTodayCount` falls to 0.
- **Fix:**
```ts
// before
(supabase.from('xp_events') as unknown as DBChain)
  .select('created_at').eq('user_id', userId).eq('source_type', 'flashcard') as unknown as Promise<…>
// after — count in SQL, bounded to the local day
const dayStartUtc = zonedDayStartUtcIso(timezone, now)   // small helper next to getLocalDateString
const { count, error } = await supabase.from('xp_events')
  .select('id', { count: 'exact', head: true })
  .eq('user_id', userId).eq('source_type', 'flashcard')
  .gte('created_at', dayStartUtc)
if (error) throw error
```
  Do the same for the other three reads: typed client, check `error`, no `DBChain`.

#### CQ-08 — Capstone autosave drops pending edits, calls `setState` inside an updater, and leaves unscoped drafts in storage
- **Severity:** High · **Effort:** M
- **Location:** `apps/web/hooks/useCapstoneAutosave.ts:32-40`, `:111-133`, `:143-150`, `:80-84`
- **Problem:**
  - (1) The unmount cleanup (144-150) *clears* the debounce timer. Anything typed in the last 2.5 s before navigating away is never saved, and not even written to `localStorage`, because the local backup only happens inside `performSave`.
  - (2) `setContent` calls `setIsDirty`, `setStatus` and `setTimeout` *inside* the `setContentState` updater (115-130). Updaters must be pure: React double-invokes them in StrictMode and warns about updates scheduled from inside an update function.
  - (3) The initializer reads `localStorage` during the first client render (35). The server rendered `initialContent`, so the first client render can differ (hydration-mismatch risk) **(verify against `RichEditor`'s SSR behaviour)**.
  - (4) The draft key is `pm_academy_capstone_draft_${moduleSlug}`. It is not scoped to the user and is never removed after submit, so on a shared machine the next learner's editor preloads it. Privacy note only; the security auditor owns this.
  - (5) Concurrent saves can finish out of order with no sequence guard.
- **Fix:**
```ts
// before
setContentState((prev) => {
  const nextValue = typeof value === 'function' ? value(prev) : value
  if (nextValue !== prev) { setIsDirty(true); setStatus('idle'); …setTimeout(…) }
  return nextValue
})
// after — pure update, side effects outside
const next = typeof value === 'function' ? value(contentRef.current) : value
if (next === contentRef.current) return
contentRef.current = next
setContentState(next)
setIsDirty(true); setStatus('idle')
localStorage.setItem(storageKey(userId, moduleSlug), next)   // back up on every keystroke
if (timerRef.current) clearTimeout(timerRef.current)
timerRef.current = setTimeout(() => void performSave(next), debounceMs)

// unmount / pagehide: flush instead of discard
useEffect(() => () => {
  if (timerRef.current) { clearTimeout(timerRef.current); void performSave(contentRef.current, { keepalive: true }) }
}, [performSave])
```
  Read `localStorage` in an effect after mount, not in the `useState` initializer. Remove the key on successful submit. Add a `saveSeq` ref so an older response cannot mark newer content as saved. Add a hook test (fake timers + unmount) — there is none today.

#### CQ-09 — `useUsageTimeTracker` calls a stale prompt callback (dependencies suppressed)
- **Severity:** Medium · **Effort:** S
- **Location:** `apps/web/hooks/useUsageTimeTracker.ts:43-50`, `:219-220`
- **Problem:** `handlePrompt` closes over the first render's `optionsOrCallback`, and the effect runs once with `eslint-disable-next-line react-hooks/exhaustive-deps`. If the parent's callback reads state (open a modal, current lesson), the version from mount runs. Separately, a failed sync re-queues with `Math.min(300, pending + bounded)` (94, 111), which drops any seconds accrued while the request was in flight.
- **Fix:**
```ts
// before
const handlePrompt = (promptKey: string) => { … optionsOrCallback(promptKey) … }
// after — latest-ref pattern, no lint suppression needed
const onPromptRef = useRef<(k: string) => void>(() => {})
useEffect(() => {
  onPromptRef.current = typeof optionsOrCallback === 'function'
    ? optionsOrCallback : (k) => optionsOrCallback?.onPromptTriggered?.(k)
})
const handlePrompt = (k: string) => { if (isMountedRef.current) onPromptRef.current(k) }
// re-queue: pendingActiveSecondsRef.current += boundedSeconds  (cap only the *send*, not the backlog)
```

#### CQ-10 — `lib/auth.ts` rotates refresh tokens and throws the new ones away
- **Severity:** Medium (latent) · **Effort:** S
- **Location:** `apps/web/lib/auth.ts:139-150` (`resolveServerUser`), `:257-269` (`resolveAuthenticatedUserFromRequest`)
- **Problem:** both fallbacks call `anonClient.auth.refreshSession({ refresh_token })` and return `data.user` without persisting `data.session`. `proxy.ts:212-218` already documents the consequence: "GoTrue rotates (revokes) the refresh token on use … refreshing would leave the browser holding a revoked token and log the learner out." The proxy refreshes and persists first, so this only runs when that failed **(verify frequency in auth telemetry)**. When it does run, the next request presents a revoked token.
- **Fix:** never refresh in a read-only resolver. Return `null` (the proxy and `/api/auth/refresh` own rotation), or return the new session to the caller so it can set cookies.
```ts
// after
if (!accessToken) return null   // session refresh is owned by proxy.ts and /api/auth/refresh (B13-A)
```

#### CQ-11 — `/api/v2/lessons/[lessonId]/progress`: needless casts, faults reported as refusals, mixed response shapes, read-then-write race
- **Severity:** Medium · **Effort:** S
- **Location:** `apps/web/app/api/v2/lessons/[lessonId]/progress/route.ts:27-45`, `:64-74`, `:114`, `:126-184`
- **Problem:**
  - (1) Seven `as unknown as` casts and a hand-written `ProgressRow` / `SupabaseTable`. Every column, `deep_dive_opened_at` included, exists in `types/database.ts:1612-1622`, so the casts only remove checking.
  - (2) DB failures throw `RouteError(500, …)`. `RouteError` means "expected refusal, no incident" (`lib/api/with-route.ts:33-40`), so real faults are never recorded.
  - (3) PATCH returns either a progress row or `{ message: 'Already completed, update ignored.' }`. `hooks/use-lesson-progress-v2.ts:59-64` writes whatever comes back into the SWR cache as a `LessonProgressV2`, leaving `status` undefined until revalidation.
  - (4) Select-then-upsert can overwrite a just-written `completed` with `in_progress` (two tabs, or a quiz finishing between the two calls).
  - (5) `await request.json()` at 114 is unguarded, so a malformed body becomes a 500 incident instead of a 400.
  - (6) The header comment says the v1 `[slug]` routes "remain active". `docs/API_CONTRACT.md` says they were deleted.
- **Fix:**
```ts
// before
const { data: updated, error } = (await (serviceSupabase.from('user_lesson_progress') as unknown as SupabaseTable)
  .upsert({ user_id: userId, lesson_id: lessonId, status }, { onConflict: 'user_id,lesson_id' })
  .select().single()) as unknown as { data: ProgressRow | null; error: unknown }
if (error) { console.error(…); throw new RouteError(500, 'SERVER_ERROR', 'Database error') }

// after — typed, atomic "never downgrade completed", faults reach withRoute
await serviceSupabase.from('user_lesson_progress')
  .upsert({ user_id: userId, lesson_id: lessonId, status: 'not_started' },
          { onConflict: 'user_id,lesson_id', ignoreDuplicates: true })
const { data: updated, error } = await serviceSupabase.from('user_lesson_progress')
  .update({ status: 'in_progress' })
  .eq('user_id', userId).eq('lesson_id', lessonId).neq('status', 'completed')
  .select().maybeSingle()
if (error) throw error
return Response.json(updated ?? (await readProgress(userId, lessonId)))   // always a row
```
  Declare `body: patchSchema` on `withRoute`, or wrap `request.json()` (see CQ-12).

#### CQ-12 — Hand-parsed request bodies turn malformed JSON into 500 incidents
- **Severity:** Low · **Effort:** S
- **Location:** `apps/web/app/api/capstones/[module]/submit/route.ts:32-37`; `app/api/v2/lessons/[lessonId]/progress/route.ts:114`; `app/api/admin/emails/broadcasts/route.ts:67`. Grep count: 66 `await request.json()` sites in route files.
- **Problem:** `withRoute` returns a clean 400 only when the route declares `body:`. Elsewhere a `SyntaxError` is classified as an unexpected fault, gets an incident row and a 500, which pollutes the incident feed with client mistakes. The capstone submit route also casts the body to a hand-typed shape instead of validating it with zod.
- **Fix:** declare a schema.
```ts
// before
async ({ request, actor, params }) => { const body = (await request.json()) as { content?: unknown; … } }
// after
const submitSchema = z.object({ content: z.string(), reflectionContent: z.string().optional(),
  reflectionIsPublic: z.boolean().optional(), isPublic: z.boolean().optional() })
withRoute({ …, body: submitSchema }, async ({ body, actor, params }) => { … })
```
  If a route must rate-limit before parsing (v2 progress, 98-101), add a shared `readJsonBody(request)` that throws `RouteError(400, 'VALIDATION', …)`.

#### CQ-13 — Fire-and-forget incident logging on a serverless runtime
- **Severity:** Medium · **Effort:** S
- **Location:** grep count 55 × `void logSystemError(` / `void logErrorReport(`, e.g. `app/api/email/webhooks/route.ts` (10), `lib/growth/lifecycle-run.ts` (5), `lib/notifications/queue/processor.ts:483-495`, `app/api/cron/daily-reminder/route.ts:96`
- **Problem:** `lib/api/with-route.ts:244-248` explains why this is wrong: "on a serverless runtime the response ends the invocation, so an un-awaited log can simply be dropped — which is the one log you least want to lose." Fifty-five call sites do it anyway.
- **Fix:** use Next's `after()` (stable in 16.x, `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md`), or `await` it.
```ts
// before
void logSystemError({ … })
// after
import { after } from 'next/server'
after(() => logSystemError({ … }))
```

### B. Type safety

#### CQ-14 — 24 files still use the `DBChain` / `as unknown as` pattern that `lib/db` was built to remove
- **Severity:** Medium · **Effort:** L (spread over many PRs)
- **Location:** `interface DBChain` declared in 24 files, including `app/(app)/dashboard/page.tsx:27`, `app/(app)/progress/{certificates,metrics,milestones,radar}/page.tsx`, `app/api/notifications/route.ts:11`, `app/api/streaks/timezone/route.ts:8`, `lib/flashcards-service.ts:18`, `lib/referral/referral-service.ts:18`, `lib/admin/{service,moderation-service,announcements-service,…}.ts`. Grep: 287 `as unknown as` in non-test code. Top files: `lib/admin/service.ts` 27, `lib/flashcards-service.ts` 26, `lib/referral/referral-service.ts` 24.
- **Problem:** `lib/db/index.ts:1-40` describes this exact pattern as how F-COR-1 shipped (a wrong column, an error that was never read, weekly XP silently zero). The ESLint ban (`eslint.config.mjs`) covers only `lib/db/**`, so the habit continues everywhere else, including in pages.
- **Fix:** move the ban to the files being migrated rather than waiting for a big-bang change.
```js
// eslint.config.mjs — widen the existing rule, with a shrinking allowlist like RAW_BUTTON_ALLOWLIST
{ files: ['lib/**/*.ts', 'app/**/*.{ts,tsx}'], ignores: DBCHAIN_LEGACY_ALLOWLIST,
  rules: { 'no-restricted-syntax': ['error',
    { selector: 'TSAsExpression > TSAsExpression > TSUnknownKeyword', message: '…use lib/db…' },
    { selector: "TSInterfaceDeclaration[id.name='DBChain']", message: 'Use SupabaseClient<Database> (Db from lib/db).' }] } }
```
  Migrate in risk order: `flashcards-service.ts` (CQ-07), `referral-service.ts` (XP awards), `v2/.../progress` (CQ-11), then the admin services.

#### CQ-15 — `as any` where generated types already exist
- **Severity:** Low · **Effort:** S
- **Location:** `apps/web/app/onboarding/actions.ts:55,109,118,268,285`; `lib/notifications/preferences/defaults.ts:190,231`; `lib/admin/user-filter-query.ts:420,536`; `lib/settings/settings-service.ts:348`; `renderer/block-tree-renderer.tsx:26-27`
- **Problem:** `onboarding_step_reached`, `onboarding_topics` and `onboarding_preference` are all in `types/database.ts:1845-1847`, so the `as any` (each with its own `eslint-disable`) protects nothing. `supabase: any` in the preference readers means a wrong column compiles. The error boundary takes `props: any` although its prop type is already declared one line above.
- **Fix:**
```ts
// before (onboarding/actions.ts:267-271)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const updatePayload: Record<string, any> = { … }
await (dbSupabase.from('users') as any).update(updatePayload).eq('id', userId)
// after
const updatePayload: TablesUpdate<'users'> = { career_role: careerRole, goal, onboarding_completed: true }
await dbSupabase.from('users').update(updatePayload).eq('id', userId)
```
  `defaults.ts`: `supabase: SupabaseClient<Database>`. `block-tree-renderer.tsx`: `constructor(props: BlockErrorBoundaryProps)`. Also the 8 `process.env.X!` sites (`app/onboarding/actions.ts:15-16`, `app/(auth)/reset-password/actions.ts:21-22`, `app/api/auth/callback/route.ts:87-88`, `app/api/auth/update-password/route.ts:210-211`) should call the validated factory in `lib/supabase.ts` rather than hand-building clients with non-null assertions (15 ad-hoc `createClient(` calls outside `lib/supabase.ts`).

### C. React / Next.js

#### CQ-16 — Capstone workspace is a client page that fetches its own API in `useEffect` and starts in the wrong state
- **Severity:** Medium · **Effort:** M
- **Location:** `apps/web/app/(app)/capstones/[module]/page.tsx:46`, `:69`, `:71-104`, `:149`, `:161`
- **Problem:**
  - Status starts as `'unlocked'` (46), so a locked or submitted capstone first renders an editable editor, then jumps to the right view when `/api/capstones/${moduleSlug}` returns.
  - A non-OK response is ignored, leaving the editor open on an unknown state, and autosave POSTs against it.
  - The progress defaults `{ totalLessons: 10, requiredLessons: 8 }` and the fallback copy "150 XP awarded." are hard-coded copies of config and runtime XP values that admins can change.
  - Errors are shown with `alert()`.
- **Fix:** split the page into a server `page.tsx` that loads submission, status and progress through the same service the API route uses, and a client `CapstoneWorkspace` that receives them as props. Until that lands, add an explicit `'loading'` state.
```tsx
// before
const [submissionStatus, setSubmissionStatus] = useState<CapstoneStatus>('unlocked')
// after (minimum)
const [submissionStatus, setSubmissionStatus] = useState<CapstoneStatus | 'loading' | 'error'>('loading')
if (submissionStatus === 'loading') return <CapstoneSkeleton />
// and: setSubmitSuccessMsg(data.message ?? `Capstone submitted! ${data.xpEarned} XP awarded.`)
```

#### CQ-17 — SSR hydration risks from locale, time-zone and random values during render
- **Severity:** Medium · **Effort:** S
- **Location:** `apps/web/components/certificates/VerificationBadge.tsx:12-16`; `components/certificates/CertificateCard.tsx:46`; `components/portfolio/FeaturedCapstoneCard.tsx:36`; `components/portfolio/PortfolioCapstones.tsx:84` (locale `undefined`); `components/portfolio/PortfolioHero.tsx:115,144` (`totalXp.toLocaleString()`); `components/notifications/NotificationItemCard.tsx:465-480` (`Date.now()`); `blocks/quiz/QuizBlock.tsx:34-48` (`Math.random()` in the `useState` initializer)
- **Problem:** these client components are SSR'd, and the public portfolio and certificate pages are the most-shared URLs. `toLocaleDateString` without `timeZone` renders the server's UTC date and then the browser's local date. A `undefined` locale or bare `toLocaleString()` switches `1,234` to `1.234` for de-DE browsers. The quiz shuffles once on the server and differently on the client whenever the page is opened with `?tab=quiz`. The marketing components already do this correctly (`components/marketing/sections/testimonials.tsx:126` passes `timeZone: 'UTC'`).
- **Fix:**
```ts
// before (VerificationBadge.tsx:12)
new Date(issuedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
// after — one shared formatter, deterministic on both sides
export const formatDisplayDate = (iso: string) =>
  new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(iso))
// numbers: totalXp.toLocaleString('en-US')
// quiz: seed the shuffle from block.blockId + user id, or shuffle in useEffect after mount
```
  Also drop `"use client"` from `VerificationBadge` (see CQ-19) so it renders only on the server.

#### CQ-18 — State reset done with `setState` in an effect (two lint suppressions)
- **Severity:** Low · **Effort:** S
- **Location:** `apps/web/components/profile/AvatarUpload.tsx:20-23`; `blocks/flashcards/FlashcardDeckBlock.tsx:144-147`
- **Problem:** "reset local state when a prop changes" via `useEffect` + `setState` costs an extra render, and needs `eslint-disable react-hooks/set-state-in-effect`.
- **Fix:** key the child (`<FlashcardItemCard key={card.id} … />`, `<AvatarUpload key={currentAvatarUrl ?? 'none'} … />`) and delete the effects and the disables.

#### CQ-19 — Unnecessary `"use client"` boundaries
- **Severity:** Low · **Effort:** S
- **Location (checked, no hooks, handlers or browser APIs):** `app/(auth)/verified/page.tsx:1`, `components/certificates/VerificationBadge.tsx:1`, `components/portfolio/PortfolioAchievements.tsx:1`, `components/portfolio/PortfolioHero.tsx:1` (its only interactive child, `ShareButton`, is already a client component), `components/capstones/CapstoneCard.tsx:1`, `components/auth/AuthErrorNotice.tsx:1`, `components/dashboard/NextCapstonePromptCard.tsx:1`, `components/admin/AdminLoadWarning.tsx:1`. 231 files declare `"use client"` in total.
- **Problem:** each directive pulls the component and its imports (lucide icons, `BADGE_DEFINITIONS`, etc.) into the client bundle for no gain, and makes date formatting a hydration concern (CQ-17).
- **Fix:** delete the directive. Interactive children keep their own.

#### CQ-20 — Redundant route-segment config
- **Severity:** Low · **Effort:** S
- **Location:** 50 × `export const runtime = 'nodejs'` (the default per `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/index.md:11`); 19 × `export const revalidate = 0` under `app/admin/(console)/**/page.tsx`. The console layout already reads cookies, which makes those pages dynamic.
- **Problem:** noise, and the same doc (line 19) says `revalidate`/`dynamic` are removed when Cache Components is enabled, so these become migration blockers.
- **Fix:** delete them. Keep `runtime` only where a route would otherwise be inferred as edge (none found).

#### CQ-21 — Hooks outside `hooks/`, React and Next imported in `lib/`, inconsistent hook file names
- **Severity:** Low · **Effort:** S
- **Location:** `apps/web/lib/api/hooks.ts` (SWR hooks + provider, `'use client'`); `lib/admin/use-is-mounted.ts`; `lib/hooks/useUsageTimeTracker.ts` (a one-line re-export shim); `useTheoryEngagement` inside `app/(app)/academy/[moduleSlug]/[lessonId]/lesson-content.tsx:169`. 13 `lib/` files import `next/*` (e.g. `lib/admin/service.ts:1-2` imports `next/cache` and `next/package.json`). `hooks/` mixes `use-analytics.ts` with `useCapstoneAutosave.ts`. Contexts live in `components/` (`components/quick-start/QuickStartContext.tsx`, `components/search/SearchOverlayProvider.tsx`) although `contexts/` exists.
- **Problem:** this breaks the TokenCap rules ("Custom React hooks live in hooks/", "lib/ … framework-agnostic") and makes "where is X" guesswork.
- **Fix:** move `lib/api/hooks.ts` → `hooks/use-api-query.ts`, `lib/admin/use-is-mounted.ts` → `hooks/use-is-mounted.ts`, delete the `lib/hooks/` shim, and rename hooks to one convention (kebab-case is the majority). Keep `revalidatePath`/`unstable_cache` calls in `app/` or a `lib/server/` folder that is explicitly Next-bound.

#### CQ-22 — `AdminSystemAlertsView` memo dependencies change every render
- **Severity:** Low · **Effort:** S
- **Location:** `apps/web/components/admin/AdminSystemAlertsView.tsx:97`, `:113-131`
- **Fix:**
```ts
// before
const alerts = data?.success ? (data.alerts || []) : []
// after
const EMPTY: AdminSystemAlert[] = []
const alerts = React.useMemo(() => (data?.success ? data.alerts ?? EMPTY : EMPTY), [data])
```

### D. Maintainability

#### CQ-23 — Same helper implemented many times
- **Severity:** Medium · **Effort:** M
- **Location and fix:**

| Duplicate | Where | Replace with |
|---|---|---|
| Site URL resolution `process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') \|\| …` | 51 sites (grep), including 6 that hard-code `'https://prodily.adityagangwani.me'` (e.g. `lib/admin/broadcast-service.ts:406-407`) | `BRAND.siteUrl` (`lib/brand.ts:26`) already does exactly this |
| `escapeHtml` | `app/api/contact/route.ts:7`, `app/api/email/webhooks/route.ts:31`, `components/ui/MarkdownRenderer.tsx:28` (the last uses `&#39;`, the others `&#039;`) | one `lib/security/escape-html.ts` |
| `formatDateTime` (identical, including a dead `try/catch`, since `toLocaleString` never throws and prints "Invalid Date") | `components/admin/AdminServiceDetailDrawer.tsx:26`, `AdminSystemAlertsView.tsx:105`, `AdminSystemAuditView.tsx:77`, `AdminSystemErrorsView.tsx:66`, `AdminSystemHealthWorkspace.tsx:42` | `lib/format/date.ts` (shared with CQ-17) |
| Local `cn()` | `components/admin/AdminCreateBroadcastModal.tsx:1082` | `cn` from `lib/utils.ts:4` |
| Two different `fetchAllRows` with the same name | `lib/db/pagination.ts:37` (throws) and `lib/growth/fetch-all-rows.ts:14` (returns `{data, error}`, and **silently truncates at 100 pages** with `error: null`) | keep `lib/db`'s; if a caller needs the non-throwing form, add `tryFetchAllRows` there |
| Feature-flag read | `lib/admin/service.ts:1259-1281` (swallows errors, stamps `updatedAt: now` on every flag) vs `lib/admin/settings-service.ts:427-433` | delete the `AdminConsoleService` pair (its `toggleFeatureFlag` at 1286 has no production caller) and use `SettingsService.getFeatureFlags` in `app/admin/(console)/system/page.tsx:75` |
| Quiz XP arithmetic | inline in `lib/academy/lessons-db.ts:296-311` vs `calculateQuizXp` in `lib/xp/xp.ts:274` (tests only) | call `calculateQuizXp` |
| Streak XP constant | `STREAK_RULES.DAILY_STREAK_XP = 5` (`lib/streaks/streaks.ts:4`, unused) vs `XP_VALUES.DAILY_STREAK_BASE` | delete the former |
| Day length | `24 * 60 * 60 * 1000` in 30+ places, plus `DAY_MS` / `MS_PER_DAY` declared separately in four files (`lib/admin/analytics-aggregation.ts:24`, `baseline-aggregation.ts:82`, `capstone-review-aging.ts:27`, `dashboard-aggregation.ts:17`) | one `MS_PER_DAY` export; this is how CQ-01's typo slipped in |
| `sb-access-token` cookie read + ad-hoc client + `getUser` | 11 cookie reads (e.g. `app/onboarding/actions.ts:95,184`, `app/admin/(console)/layout.tsx:33`) | `getServerUser()` from `lib/auth.ts:168` |

#### CQ-24 — Username rules differ between onboarding and Settings; onboarding skips reserved words
- **Severity:** Medium · **Effort:** S
- **Location:** `apps/web/app/onboarding/actions.ts:43-51`, `:239-242` vs `lib/portfolio.ts:25-46` (and a third copy, `lib/notifications/in-app/secondary-action.ts:26`)
- **Problem:** onboarding allows 3–24 characters `^[a-z0-9_]+$` and has **no reserved-word check**. Settings allows 3–30 `[a-zA-Z0-9_-]` and rejects `admin`, `api`, `settings`, … The comment at `onboarding/actions.ts:20-21` claims Settings "validates them identically". It doesn't: a learner can claim `admin` or `dashboard` during onboarding, and a hyphenated handle valid in Settings fails in onboarding. `checkUsernameAvailability` also reports "available" on a DB error (`:61-63`, `:71-73`).
- **Fix:**
```ts
// onboarding/actions.ts
import { validateUsername } from '@/lib/portfolio'
const check = validateUsername(username)
if (username && !check.isValid) return { error: check.reason }
```
  Pick one character set (lowercase only is safer for URLs) and enforce it in both places plus a DB `CHECK`. On a DB error, return `{ available: false, error: 'Could not check right now' }`.

#### CQ-25 — Oversized files
- **Severity:** Medium · **Effort:** L
- **Largest 15 non-generated source files (lines):**

| # | File | Lines | Note |
|---|---|---:|---|
| 1 | `lib/admin/service.ts` | 1,289 | one `AdminConsoleService` class mixing health, users, roles, fellow, portfolio, content, email queue and feature flags; `getUserDetailDataUnsafe` alone is ~400 lines (447-841) |
| 2 | `app/(app)/academy/[moduleSlug]/[lessonId]/lesson-content.tsx` | 1,089 | 15 `useState`, 9 `useEffect`, 5 inner components and a custom hook |
| 3 | `components/admin/AdminCreateBroadcastModal.tsx` | 1,084 | one component with **24 `useState`**, hard-coded option lists, local `cn` |
| 4 | `lib/notifications/queue/processor.ts` | 1,027 | enqueue + claim + send + retry + dead-letter |
| 5 | `lib/admin/dashboard-service.ts` | 992 | |
| 6 | `lib/admin/types.ts` | 939 | type barrel |
| 7 | `lib/campaigns/portfolio-activation-runner.ts` | 890 | see CQ-02; HTML templates inline |
| 8 | `lib/admin/communications-service.ts` | 841 | |
| 9 | `lib/admin/system-service.ts` | 801 | overlaps with `AdminConsoleService.getSystemHealth` |
| 10 | `lib/admin/in-app-manager-service.ts` | 794 | |
| 11 | `lib/admin/analytics-service.ts` | 745 | |
| 12 | `lib/admin/moderation-service.ts` | 741 | |
| 13 | `lib/admin/baseline-aggregation.ts` | 709 | |
| 14 | `components/admin/AdminEmailAutomationsView.tsx` | 701 | |
| 15 | `components/admin/AdminCreateInAppNotificationModal.tsx` | 693 | |

  (`types/database.ts`, 2,299 lines, is generated and excluded.)
- **Recommendation for the worst (`lib/admin/service.ts`):** split along the domains that already have sibling services. Move `getSystemHealth` into `system-service.ts`, `getEmailQueueOverview` into `communications-service.ts`, and delete the feature-flag pair (CQ-23). Create `users-admin-service.ts` for `getUsersOverview`, `getUsersKpis` and `getUserDetailData` (with `getUserDetailDataUnsafe` broken into one loader per tab) and `roles-service.ts` for the admin/fellow/verification toggles. Keep `AdminConsoleService` as a thin re-export for one release so the 11 import sites keep working.
  For `AdminCreateBroadcastModal`, move form state to `react-hook-form` + zod (already a dependency), turn each step into its own component, and import option lists from `lib/admin/onboarding-defaults.ts` (CQ-26).

#### CQ-26 — Broadcast audience filter hard-codes onboarding option lists
- **Severity:** Low · **Effort:** S
- **Location:** `apps/web/components/admin/AdminCreateBroadcastModal.tsx:43-75`
- **Problem:** `EXPERIENCE_OPTIONS`, `GOAL_OPTIONS` and `TOPIC_OPTIONS` duplicate `lib/admin/onboarding-defaults.ts:28-130`, but onboarding options are admin-editable at runtime (`OnboardingSettingsSection`). An admin-added goal cannot be targeted by a broadcast. Labels already differ ("Discovery" vs "Product Discovery").
- **Fix:** pass the live onboarding settings into the modal and fall back to `DEFAULT_*_OPTIONS`.

#### CQ-27 — Magic numbers and copy that duplicate config
- **Severity:** Low · **Effort:** S
- **Location:**
  - `app/api/v2/lessons/[lessonId]/quiz/route.ts:21`: `max(3)` assumes exactly four options. Derive it from the question, or validate server-side against `q.options.length`.
  - `lib/streaks/streaks-db.ts:106`: `milestoneDays` should live next to `STREAK_RULES`.
  - `lib/xp/xp.ts:184-186`: levels 7, 8 and 9 all titled "Chief Product Officer", so the level 8 and level 9 notifications announce the same title again. Product decision, flagged.
  - `app/(app)/capstones/[module]/page.tsx:69,149` (CQ-16).
  - `lib/admin/broadcast-service.ts:510-514`: matching on campaign *names* (`'Prodily Public Portfolio & First Capstone Campaign'`, `'portfolio_activation_sep_2026'`) inside the generic scheduler. Use only `template_key`.

#### CQ-28 — Dead code
- **Severity:** Low · **Effort:** S
- **Location:** a scan of exported identifiers with zero textual references anywhere (approximate; confirm with `knip` before deleting) found **71**, including:
  - `components/brand/BrandLogo.tsx` (`AnimatedBrandLogo`, `StaticBrandLogo`, `BrandMarkProdigy`, `WordmarkLogo`)
  - marketing sections `community.tsx`, `faq.tsx`, `testimonials.tsx` (`TestimonialsSection`) and three `product-mockup/*` previews
  - `hooks/useXpAnimation.ts`
  - `lib/animation.ts` (9 presets)
  - `lib/academy/lessons-db.ts` (`getUserLessonProgress`, `getUserCompletedLessonIds`)
  - `lib/campaigns/portfolio-activation-runner.ts` (`schedulePortfolioCampaign`, `cancelPortfolioCampaign`, `parseIstDateTime`)
  - `lib/search.ts` (`fetchSearchIndex`, `searchClientIndex`)
  - `lib/streaks/streaks.ts` (`isSameDay`)
  - `lib/xp/xp.ts` (`LEVEL_TITLES`, `getTitleForXp`)
  - `config/content.ts` (`TESTIMONIALS`, `EXPERIENCE_FEATURES`, `PORTFOLIO_ARTIFACTS`)

  Also: the `password.reset_requested` connector (`lib/notifications/events/connectors.ts:89-105`) is registered but the event is never dispatched (auth mail goes through the Supabase hook, per `RULES.md §2.1`). The `userTimezone` field on notification envelopes is set to `'UTC'` in 13 places and read nowhere in production.
- **Fix:** delete them, and add `knip` to CI so the list stays at zero.

#### CQ-29 — Raw control bytes in a TypeScript source file
- **Severity:** Low · **Effort:** S
- **Location:** `apps/web/lib/monitoring/log.ts` (`stripControlCharacters`, byte offset ~2,494)
- **Problem:** the regex character class contains literal NUL, US, DEL and U+009F bytes. `file` reports the file as `data`, and `grep` prints "Binary file lib/monitoring/log.ts matches" and **skips its contents**, so codebase searches and review tooling silently miss this logger. The regex itself is correct.
- **Fix:**
```ts
// after
return input.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
```
  ESLint's `no-control-regex` would then flag only intentional cases.

### E. Consistency (errors, logging, API shapes)

#### CQ-30 — Three error envelopes; raw `fetch` beside the typed client; `console.error` instead of `logSystemError`
- **Severity:** Medium · **Effort:** M
- **Location / evidence (grep):**
  - **Envelopes:** ADR-006 `{ success: false, error, code, requestId }` via `RouteError`/`apiError` (48 `new RouteError(`), versus 109 `NextResponse.json({ error: … })` sites in 41 route files with no `success` or `code`, versus bare rows from `Response.json(...)` in the v2 lesson routes (25 sites).
  - **Client calls:** 39 `fetch('/api…')` sites (e.g. `components/notifications/NotificationCenterDrawer.tsx:66,84,136,201`, `app/(app)/capstones/[module]/page.tsx:75,131`) versus 74 typed `apiGet`/`apiPost`/`apiPatch` calls. The raw calls lose `requestId`, `errorId` and failure-kind normalisation.
  - **Logging:** 193 `console.error` in `app/` and `lib/` versus 52 `logSystemError(` and 20 `logErrorReport(`.
- **Fix:**
  - Routes: return errors only through `throw new RouteError(...)`/`PublicError`. Add a `no-restricted-syntax` rule in `app/api/**` for `ObjectExpression > Property[key.name='error']` inside `NextResponse.json` calls, with an allowlist that shrinks over time (the `RAW_BUTTON_ALLOWLIST` approach).
  - Client: add a `no-restricted-syntax` rule on `CallExpression[callee.name='fetch'] > Literal[value=/^\/api\//]` in `components/**`, `app/**` and `hooks/**`.
  - Logging: in `lib/` services, replace `console.error` on failure paths with `log.exception(...)` (`lib/monitoring/log.ts`) or `logSystemError`, as `RULES.md §2.3` requires.

### F. Tests

#### CQ-31 — `main` is red: one test uses `CSS.escape`, which jsdom doesn't provide
- **Severity:** Medium · **Effort:** S
- **Location:** `apps/web/components/__tests__/fellow-history-ui.test.tsx:138`
- **Fix:**
```ts
// before
expect(list.closest(`#${CSS.escape(toggle!.getAttribute('aria-controls') ?? '')}`)).not.toBeNull()
// after
const panel = document.getElementById(toggle!.getAttribute('aria-controls') ?? '')
expect(panel?.contains(list)).toBe(true)
```

#### CQ-32 — Mocks make the code under test throw, and assertions don't notice
- **Severity:** Medium · **Effort:** M
- **Location:** `apps/web/lib/__tests__/dashboard.test.ts:286-297` (and 11 other suites; the run log shows 27 `… is not a function` TypeErrors raised inside code under test, e.g. `phase-1-lifecycle-reactivation.test.ts`, `analytics-growth.test.ts`, `admin-console.test.ts`, `moderation-pagination.test.ts`, `settings-change-password.test.ts`)
- **Problem:** in "getDashboardData returns full KPI and series structure" the run logs `[DashboardService] kpis loader failed: TypeError: supabase.from(...)...range is not a function` and the same for `series`. The test still passes because it checks only `typeof data.kpis.totalUsers === 'number'`, which the zeroed fallback satisfies. The service already exposes `failed: boolean` per slice (`lib/admin/dashboard-service.ts:252-278`); the test never reads it.
- **Fix:**
```ts
// after
expect(data.kpis.failed).toBe(false)
expect(data.series.failed ?? false).toBe(false)
```
  Add a `vitest.setup.ts` guard that fails any test where code under test logs `is not a function` (spy on `console.error`/`console.warn` and assert on it in `afterEach`, allow-listing tests that expect degradation). Replace hand-rolled chain mocks with one chainable Supabase fake in `lib/__tests__/helpers/` that implements the whole builder (`select`, `eq`, `in`, `gte`, `lte`, `order`, `range`, `like`, `maybeSingle`, `single`, `insert`, `update`, `upsert`, `rpc`).

#### CQ-33 — Source-text tests, tested-but-unused helpers, and untested critical paths
- **Severity:** Medium · **Effort:** M
- **Location / evidence:**
  - **Source-text assertions:** about 266 `expect(source|content|…).toContain/toMatch` assertions across 57 test files that `readFileSync` source (e.g. `lib/__tests__/b7e-learner-route-migration.test.ts:241-255` asserts the literal text `'rateLimit: ['`; `b11b-learner-states.test.ts:143-178`). A harmless refactor breaks them and a behavioural bug passes. The architectural ones belong in ESLint (where `require-with-route` already lives). The behavioural ones should call the handler.
  - **Helpers tested but not used in production:**
    - `calculateQuizXp` and `getXpAmountForSource` (`lib/xp/xp.ts`)
    - `isUserInReminderWindow` and `isUserInRecapWindow` (`lib/notifications/timezone.ts:93-115`); the crons re-implement the window inline
    - `isUserEligibleForWeeklyRecap`
    - `recordBatchFlashcardReviews`
    - `isValidQueueStatusTransition`
    - `upsertUserLessonProgress`

    39 exports are referenced only from tests in all. Their coverage is real but does not protect what ships.
  - **Untested critical code** (0 test references): `updateUserStreak`, `getUserStreakStatus`, `getWeeklySummary` (CQ-01), `useCapstoneAutosave` (CQ-08), `useLessonProgressV2`, `recordTheoryReadAction`, `executePortfolioActivationCampaign` / `fetchAudienceAndCandidates` (CQ-02).
- **Fix:** for each helper, either wire it into production (`calculateQuizXp` in `lessons-db`, the window helpers in the crons) or delete it with its tests. Add behaviour tests for the untested list, starting with the streak DB functions (fixed clock, several time zones) and autosave (fake timers + unmount).

---

## Fix order

Work top to bottom. Items in the same bullet can share a PR.

- [ ] **CQ-31** Fix `CSS.escape` in `fellow-history-ui.test.tsx` so `main` is green again. *(S)*
- [ ] **CQ-03** Suppression and preference reads block the send on error; pass `strict: true` from daily-reminder and weekly-recap. *(S)*
- [ ] **CQ-02** Stop the portfolio-activation runner sending outside the queue. Page every audience read with `fetchAllRows`, page `listUsers`, throw on read errors. Disable the scheduler hook for it until fixed. *(M)*
- [ ] **CQ-01** Replace `84600000`, step calendar days, throw on profile-read error, add clock-pinned tests. Add the shared `MS_PER_DAY`. *(S)*
- [ ] **CQ-05** Quiz RPC: log and fall back only on "function missing", otherwise throw; use `calculateQuizXp`. *(S)*
- [ ] **CQ-08** Capstone autosave: pure updater, back up every keystroke, flush on unmount, user-scoped key cleared on submit, tests. *(M)*
- [ ] **CQ-04** Add `event_id` + `.limit(1)` to the legacy dedupe, or move remaining callers to `idempotencyKey`. *(S)*
- [ ] **CQ-06** Remove inner `try/catch` from `withRoute` admin handlers; services throw instead of returning `[]`. Start with emails and broadcasts. *(M)*
- [ ] **CQ-07** Flashcards: typed client, check every `error`, count today's reviews in SQL. *(S)*
- [ ] **CQ-11 / CQ-12** v2 progress route: typed queries, conditional update, always return a row, declared body schemas. Same for capstone submit. *(S)*
- [ ] **CQ-09** Latest-ref callback in `useUsageTimeTracker`; drop the lint suppression. *(S)*
- [ ] **CQ-10** Stop calling `refreshSession` in `lib/auth.ts` resolvers. *(S)*
- [ ] **CQ-24** Onboarding uses `validateUsername`; one character set plus a DB CHECK; reserved words enforced. *(S)*
- [ ] **CQ-13** Replace `void logSystemError(...)` with `after(() => …)` or `await`. *(S)*
- [ ] **CQ-32** Dashboard test asserts `failed === false`; add the console-TypeError guard; build a shared chainable Supabase fake. *(M)*
- [ ] **CQ-16 / CQ-17 / CQ-19** Server-load the capstone page; deterministic date and number formatting; drop needless `"use client"`. *(M)*
- [ ] **CQ-14 / CQ-15** Widen the `as unknown as` / `DBChain` ban with a shrinking allowlist; remove `as any` where generated types exist. *(L, incremental)*
- [ ] **CQ-23 / CQ-26** Consolidate duplicated helpers (site URL, escapeHtml, formatDateTime, fetchAllRows, feature flags, cookie auth, option lists). *(M)*
- [ ] **CQ-30** Single error envelope plus the lint rule; migrate raw `fetch('/api…')` to the typed client; `console.error` → structured logger on failure paths. *(M)*
- [ ] **CQ-25** Split `lib/admin/service.ts`, `AdminCreateBroadcastModal.tsx` and `lesson-content.tsx`. *(L)*
- [ ] **CQ-33** Wire up or delete test-only helpers; add behaviour tests for streak DB, autosave and the campaign runner; convert architectural grep tests to ESLint rules. *(M)*
- [ ] **CQ-18 / CQ-20 / CQ-21 / CQ-22 / CQ-27 / CQ-28 / CQ-29** Cleanup: keyed resets, redundant segment config, hook placement and naming, memo deps, magic numbers, dead code (+ `knip` in CI), control bytes in `log.ts`, the 22 non-test lint warnings. *(S each)*

---

## What's already good

- **The gates are nearly clean.** `tsc --noEmit` passes with 0 errors under `strict: true`, ESLint has 0 errors, and 3,857 of 3,858 tests pass.
- **`withRoute` is a real contract, and it's enforced.** Actor policy, zod validation, rate limiting, request-id correlation and an incident-backed error envelope live in one wrapper (`lib/api/with-route.ts`). A custom ESLint rule makes every `app/api/**/route.ts` adopt it, with only three documented, structurally justified exemptions.
- **The team learns from incidents in code, not just in docs.** `lib/db/` with its scoped `as unknown as` ban, `fetchAllRows` with `POSTGREST_PAGE_SIZE`, `isUniqueViolation` + partial unique indexes for XP idempotency (`lib/xp/xp-service.ts:58-79`), and `idempotencyKey` on the queue are all correct fixes for real past bugs. Most findings above are about extending these fixes to the code they don't yet cover.
- **The pure domain logic is separated and tested.** `lib/streaks/streaks.ts` (freeze handling, timezone-aware date strings) and `lib/xp/xp.ts` (`calculateLevel`) have no I/O and are covered by dedicated suites.
- **`getTotalXp` reads the authoritative `users.total_xp`.** It avoids the 1,000-row truncation and labels its bounded fallback as approximate (`lib/xp/xp-service.ts:131-191`).
- **The queue's degraded mode is loud.** The fallback claim in `processor.ts:471-534` logs an incident with a `nextAction`, and uses compare-and-swap claiming that increments `attempt_count`. This is the model CQ-05 should copy.
- **Error text is sanitised before it leaves the server.** `apiError` sanitises every message, and `adminErrorMessage` redacts secrets while keeping diagnostics for operators.
- **Comments explain why, not what.** Rationale, incident IDs and trade-offs are written where the code lives, which made this audit much faster.

---

*Security notes I came across but did not audit (for the security auditor):*
- `checkUsernameAvailability` is a server action callable without auth, so usernames can be enumerated.
- Capstone drafts are stored in `localStorage` without user scoping (CQ-08).
- `QuizBlock` ships `correctAnswer` to the browser; the server re-validates, so it is a hint leak only.
- `next.config.ts` allows `http://localhost` and `127.0.0.1` image origins in production builds.
