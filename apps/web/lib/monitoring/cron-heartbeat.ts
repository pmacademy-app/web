/**
 * Per-job cron heartbeats and stale detection (ENG-01).
 *
 * Every scheduled route records `system_settings['cron_heartbeat:<job>']` when it finishes, so
 * the admin System page can show each job's last run and last success, and the five-minute
 * queue run can tell when a job has stopped running. Before this only process-email-queue
 * wrote a heartbeat, and a dead hourly or daily job was invisible.
 *
 * Stale means the last success is older than the job's stale threshold: twice its interval, but
 * never less than 30 minutes, so ordinary scheduler lag on a five-minute job is not an alert.
 * Each stale episode (from the last success until the next one) raises one out-of-band alert
 * through `deliverOutOfBandAlert`. A job with no heartbeat row at all is `missing`: the first
 * check that sees it missing records `missing_since`, and once the same threshold has passed
 * from there it alerts once, like a stale job. The alert marker lives under its own key
 * (`cron_heartbeat_alert:<job>`), so the checker never writes to a heartbeat row and cannot
 * overwrite a fresh beat that lands between its read and its write.
 *
 * This checker runs inside process-email-queue, so it cannot report its own scheduler dying.
 * The held dead-man job (supabase/migrations/pending-approval/20261030000001_cron_heartbeat_deadman.sql)
 * reads the same heartbeat rows from inside the database and covers that case.
 *
 * Nothing here throws: a heartbeat or alert failure must never fail the cron run itself.
 */
import { deliverOutOfBandAlert, type OutOfBandAlert, type OutOfBandAlertResult } from './out-of-band-alert'
import { sanitizeErrorMessage } from './redaction'
import type { createServiceRoleClient, Json } from '@/lib/supabase'

export type CronJobName =
  | 'process-email-queue'
  | 'process-broadcasts'
  | 'retry-failed'
  | 'daily-reminder'
  | 'weekly-recap'
  | 'lifecycle'
  | 'cleanup'

export interface CronJobDefinition {
  job: CronJobName
  /** Label for the admin System page. */
  name: string
  path: string
  /** Scheduled cadence in minutes, or null for a job that is not scheduled. */
  intervalMinutes: number | null
}

/**
 * The scheduled jobs and their cadence. Must match the pg_cron schedule
 * (supabase/migrations/pending-approval/20261024000003_schedule_cron_jobs_pg_cron.sql) and the
 * GitHub Actions fallback (.github/workflows/notification-scheduler.yml). The dead-man check
 * (pending-approval/20261030000001_cron_heartbeat_deadman.sql) repeats the scheduled intervals;
 * eng01-cron-heartbeat.test.ts fails if the two drift apart.
 */
export const CRON_JOB_DEFINITIONS: readonly CronJobDefinition[] = [
  { job: 'process-email-queue', name: 'Process Email Queue', path: '/api/cron/process-email-queue', intervalMinutes: 5 },
  { job: 'process-broadcasts', name: 'Process Broadcasts', path: '/api/cron/process-broadcasts', intervalMinutes: 5 },
  { job: 'daily-reminder', name: 'Daily Reminder', path: '/api/cron/daily-reminder', intervalMinutes: 60 },
  { job: 'weekly-recap', name: 'Weekly Recap', path: '/api/cron/weekly-recap', intervalMinutes: 60 },
  { job: 'lifecycle', name: 'Lifecycle Sequences', path: '/api/cron/lifecycle', intervalMinutes: 60 },
  { job: 'cleanup', name: 'Cleanup', path: '/api/cron/cleanup', intervalMinutes: 24 * 60 },
  // Deprecated, manual runs only (workflow_dispatch). Recorded, never expected, never stale.
  { job: 'retry-failed', name: 'Retry Failed Emails (manual)', path: '/api/cron/retry-failed', intervalMinutes: null },
]

export const CRON_JOB_INTERVALS_MINUTES: Readonly<Record<CronJobName, number | null>> = Object.fromEntries(
  CRON_JOB_DEFINITIONS.map((j) => [j.job, j.intervalMinutes])
) as Record<CronJobName, number | null>

/** A job is stale once its last success is older than this many intervals... */
export const STALE_INTERVAL_MULTIPLIER = 2

/** Minutes without a success (or, for a missing row, since first seen missing) before a job alerts. */
export function staleThresholdMinutes(intervalMinutes: number): number {
  return STALE_INTERVAL_MULTIPLIER * intervalMinutes
}

export interface CronHeartbeat {
  job: CronJobName
  status: 'healthy' | 'failed'
  last_run_at: string
  last_success_at?: string
  /** First run ever recorded: the stale reference for a job that has never succeeded. */
  first_run_at?: string
  last_duration_ms?: number
  error?: string
  [detail: string]: unknown
}

type Client = ReturnType<typeof createServiceRoleClient>

interface Deps {
  /** Injected in tests; defaults to the service-role client. */
  client?: Client
  now?: Date
}

export function heartbeatKey(job: CronJobName): string {
  return `cron_heartbeat:${job}`
}

function alertKey(job: CronJobName): string {
  return `cron_heartbeat_alert:${job}`
}

async function resolveClient(client?: Client): Promise<Client> {
  if (client) return client
  const { createServiceRoleClient } = await import('@/lib/supabase')
  return createServiceRoleClient()
}

/**
 * Reads one settings row as an object, or null when there is no row. A read error throws: the
 * stale check must not mistake an unreadable heartbeat for a missing one and alert on it.
 */
async function readSetting(client: Client, key: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await client.from('system_settings').select('value').eq('key', key).maybeSingle()
  if (error) throw new Error(`system_settings read failed for ${key}: ${error.message}`)
  const value = (data as { value?: unknown } | null)?.value
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

async function writeSetting(client: Client, key: string, value: Record<string, unknown>, nowIso: string): Promise<void> {
  await client.from('system_settings').upsert({ key, value: value as unknown as Json, updated_at: nowIso })
}

/**
 * Records one finished run. A failed run keeps the previous `last_success_at`, so staleness is
 * measured from the last time the job actually worked; a healthy run drops the old error.
 */
export async function recordCronHeartbeat(
  job: CronJobName,
  status: 'healthy' | 'failed',
  details: Record<string, unknown> = {},
  deps: Deps = {}
): Promise<void> {
  try {
    const client = await resolveClient(deps.client)
    const nowIso = (deps.now ?? new Date()).toISOString()
    const prev = await readSetting(client, heartbeatKey(job)).catch(() => null)
    const prevSuccess = typeof prev?.last_success_at === 'string' ? prev.last_success_at : undefined
    const prevFirst = typeof prev?.first_run_at === 'string' ? prev.first_run_at : undefined

    const payload: CronHeartbeat = {
      ...details,
      job,
      status,
      last_run_at: nowIso,
      first_run_at: prevFirst ?? nowIso,
      ...(status === 'healthy'
        ? { last_success_at: nowIso }
        : prevSuccess
          ? { last_success_at: prevSuccess }
          : {}),
    }
    if (status === 'healthy') delete payload.error
    await writeSetting(client, heartbeatKey(job), payload, nowIso)
  } catch (err) {
    console.warn(`[cron-heartbeat] Failed to record heartbeat for ${job}:`, err instanceof Error ? err.message : String(err))
  }
}

/**
 * Runs a cron handler and records its heartbeat: healthy for a response below 500, failed for
 * a 5xx or an exception (which is rethrown so the route wrapper still answers with its error
 * envelope).
 */
export async function withCronHeartbeat(job: CronJobName, run: () => Promise<Response>, deps: Deps = {}): Promise<Response> {
  const started = Date.now()
  try {
    const res = await run()
    await recordCronHeartbeat(
      job,
      res.status >= 500 ? 'failed' : 'healthy',
      { last_duration_ms: Date.now() - started, last_http_status: res.status },
      deps
    )
    return res
  } catch (err) {
    await recordCronHeartbeat(
      job,
      'failed',
      { last_duration_ms: Date.now() - started, error: sanitizeErrorMessage(err instanceof Error ? err.message : String(err)) },
      deps
    )
    throw err
  }
}

/** Reads every job's heartbeat (one small keyed read per job, run in parallel). */
export async function readCronHeartbeats(
  client: Client,
  jobs: readonly CronJobDefinition[] = CRON_JOB_DEFINITIONS
): Promise<Map<CronJobName, CronHeartbeat | null>> {
  const entries = await Promise.all(
    jobs.map(async (j) => [j.job, (await readSetting(client, heartbeatKey(j.job))) as CronHeartbeat | null] as const)
  )
  return new Map(entries)
}

export type HeartbeatState = 'fresh' | 'stale' | 'missing' | 'unmonitored'

export interface HeartbeatEvaluation {
  state: HeartbeatState
  /** The timestamp staleness is measured from (last success, else first or last run). */
  reference: string | null
  /** Whole minutes since `reference`, or null when there is none. */
  minutesSinceReference: number | null
}

/** Pure: is this heartbeat fresh, stale, missing, or not monitored at all? */
export function evaluateHeartbeat(hb: CronHeartbeat | null, intervalMinutes: number | null, now: Date): HeartbeatEvaluation {
  if (!hb) return { state: 'missing', reference: null, minutesSinceReference: null }
  const reference =
    (typeof hb.last_success_at === 'string' && hb.last_success_at) ||
    (typeof hb.first_run_at === 'string' && hb.first_run_at) ||
    (typeof hb.last_run_at === 'string' && hb.last_run_at) ||
    null
  const refMs = reference ? new Date(reference).getTime() : NaN
  const minutes = Number.isNaN(refMs) ? null : Math.floor((now.getTime() - refMs) / 60_000)
  if (intervalMinutes === null) return { state: 'unmonitored', reference, minutesSinceReference: minutes }
  if (Number.isNaN(refMs)) return { state: 'stale', reference, minutesSinceReference: null }
  const stale = now.getTime() - refMs > staleThresholdMinutes(intervalMinutes) * 60_000
  return { state: stale ? 'stale' : 'fresh', reference, minutesSinceReference: minutes }
}

export interface StaleCheckResult {
  /** Jobs currently stale. */
  stale: CronJobName[]
  /** Jobs with no heartbeat row for longer than their stale threshold since first seen missing. */
  missing: CronJobName[]
  /** Jobs alerted by this call (a job already alerted for this episode is not). */
  alerted: CronJobName[]
}

type CheckDeps = Deps & { deliver?: (alert: OutOfBandAlert) => Promise<OutOfBandAlertResult> }

/**
 * Checks every monitored job and alerts once per job per episode. Called from the five-minute
 * process-email-queue run.
 *
 * A stale episode is identified by the heartbeat's reference timestamp, which only changes when
 * the job succeeds again. A missing heartbeat (no row at all: never deployed, never run, or the
 * row was deleted) starts a grace period on the first check that sees it: `missing_since` is
 * stored on the job's alert marker, and the job alerts once the stale threshold has passed from
 * there. That episode is `missing:<missing_since>`.
 */
export async function checkStaleHeartbeats(
  intervals: Readonly<Partial<Record<CronJobName, number | null>>> = CRON_JOB_INTERVALS_MINUTES,
  deps: CheckDeps = {}
): Promise<StaleCheckResult> {
  const result: StaleCheckResult = { stale: [], missing: [], alerted: [] }
  const deliver = deps.deliver ?? deliverOutOfBandAlert
  const now = deps.now ?? new Date()
  const nowIso = now.toISOString()
  try {
    const client = await resolveClient(deps.client)
    const jobs = CRON_JOB_DEFINITIONS.filter((j) => typeof intervals[j.job] === 'number')
    const beats = await readCronHeartbeats(client, jobs)

    // One job's marker read or write failing must not skip the others.
    const checkJob = async (j: CronJobDefinition): Promise<void> => {
      const interval = intervals[j.job] as number
      const threshold = staleThresholdMinutes(interval)
      const evaluation = evaluateHeartbeat(beats.get(j.job) ?? null, interval, now)
      if (evaluation.state !== 'stale' && evaluation.state !== 'missing') return

      const marker = await readSetting(client, alertKey(j.job))
      let episode: string
      let message: string

      if (evaluation.state === 'missing') {
        const since = typeof marker?.missing_since === 'string' ? marker.missing_since : null
        const sinceMs = since ? new Date(since).getTime() : NaN
        if (!since || Number.isNaN(sinceMs)) {
          // First sighting: start the grace period, never alert on it.
          await writeSetting(client, alertKey(j.job), { ...(marker ?? {}), job: j.job, missing_since: nowIso }, nowIso)
          return
        }
        const minutesMissing = Math.floor((now.getTime() - sinceMs) / 60_000)
        if (now.getTime() - sinceMs <= threshold * 60_000) return
        result.missing.push(j.job)
        episode = `missing:${since}`
        message = `Cron job ${j.job} has no heartbeat row (missing for ${minutesMissing} minutes, expected every ${interval} minutes).`
      } else {
        result.stale.push(j.job)
        episode = evaluation.reference ?? 'unknown'
        const minutes = evaluation.minutesSinceReference
        message = `Cron job ${j.job} has not succeeded for ${minutes === null ? 'an unknown time' : `${minutes} minutes`} (expected every ${interval} minutes).`
      }

      if (marker?.episode === episode) return

      const outcome = await deliver({
        incidentId: `cron-heartbeat:${j.job}:${episode}`,
        severity: 'critical',
        kind: 'cron_stale',
        domain: 'cron',
        operation: `cron.${j.job}.heartbeat`,
        message,
        nextAction:
          'Check the scheduler (pg_cron cron.job_run_details, or the notification-scheduler GitHub Actions workflow) and the route logs on Vercel.',
        fingerprint: `cron_stale:${j.job}`,
      })
      console.warn(`[cron-heartbeat] ${j.job} is ${evaluation.state} (episode ${episode})`)

      // A transient delivery failure is retried on the next check. Not configured means
      // nothing could be delivered anyway, so the episode is marked to avoid retrying forever.
      if (!outcome.delivered && outcome.reason === 'failed') return
      await writeSetting(client, alertKey(j.job), { ...(marker ?? {}), job: j.job, episode, alerted_at: nowIso }, nowIso)
      result.alerted.push(j.job)
    }

    await Promise.all(
      jobs.map((j) =>
        checkJob(j).catch((err) => {
          console.warn(`[cron-heartbeat] Heartbeat check for ${j.job} failed:`, err instanceof Error ? err.message : String(err))
        })
      )
    )
  } catch (err) {
    console.warn('[cron-heartbeat] Stale heartbeat check failed:', err instanceof Error ? err.message : String(err))
  }
  return result
}
