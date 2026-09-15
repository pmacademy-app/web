import type { Db } from '@/lib/db'
import { log } from '@/lib/monitoring/log'

import {
  cutoffFor,
  isExpiredDailyCounterKey,
  RETENTION_RULES,
  type RetentionRule,
} from './policy'

/**
 * The retention sweep (B9-D).
 *
 * ## Dry-run is the default, and that is the safety mechanism
 *
 * Every function here takes `dryRun` and it is not optional. In dry-run the sweep
 * runs the same selects, reports the same counts, and deletes nothing — so the
 * first production run answers "what would this remove?" with real numbers before
 * anyone is asked to approve removing them. The caller
 * (`app/api/cron/cleanup/route.ts`) defaults it to true and requires an explicit
 * environment flag to turn it off; see that file for the second half of the gate.
 *
 * ## Bounded, resumable, and safe to run twice
 *
 * Deletes go out in batches of ids that were just selected, never as one open
 * `DELETE ... WHERE timestamp < x`. That keeps each statement short enough to
 * avoid holding locks on a large table, keeps the work inside the workflow's
 * five-minute budget, and means an interrupted run has simply done less work
 * rather than leaving anything inconsistent.
 *
 * Re-running is a no-op on rows already gone: eligibility is recomputed from the
 * current clock every time, and a row deleted on the last run cannot match again.
 * A partial failure stops that rule and lets the others proceed — one unreachable
 * table must not prevent the other seven from being swept.
 */

/** How many rows one statement may remove. Small enough not to hold a long lock. */
export const DELETE_BATCH_SIZE = 500

/** How many batches one rule may run before yielding, so no rule can starve the rest. */
export const MAX_BATCHES_PER_RULE = 20

/** Leaves headroom inside the scheduler's 5-minute timeout. */
export const DEFAULT_SWEEP_BUDGET_MS = 4 * 60 * 1000

export interface RuleOutcome {
  id: string
  table: string
  days: number
  reason: string
  /** Rows matched as eligible. In dry-run this is what *would* be deleted. */
  eligible: number
  /** Rows actually removed. Always 0 in dry-run. */
  deleted: number
  /** True when the rule stopped on its batch ceiling or the time budget. */
  truncated: boolean
  error?: string
}

export interface SweepResult {
  dryRun: boolean
  startedAt: string
  durationMs: number
  totalEligible: number
  totalDeleted: number
  rules: RuleOutcome[]
  budgetExhausted: boolean
}

/** Applies a rule's filters to a select or delete builder. */
function applyFilters(
  // The Supabase builder type is deeply generic and differs between select and
  // delete; the shared surface this needs is the four filter methods.
  builder: {
    lt: (column: string, value: string) => typeof builder
    eq: (column: string, value: unknown) => typeof builder
    in: (column: string, values: readonly unknown[]) => typeof builder
    not: (column: string, operator: string, value: unknown) => typeof builder
  },
  rule: RetentionRule,
  cutoffIso: string
) {
  let q = builder.lt(rule.timestampColumn, cutoffIso)

  // A held record is never eligible, at any age, for any reason — L-11's
  // "active legal/incident holds override automatic deletion".
  if (rule.supportsHold) q = q.eq('retention_hold', false)

  if (rule.statusColumn && rule.statusIn) q = q.in(rule.statusColumn, rule.statusIn)
  if (rule.statusColumn && rule.statusNotIn) q = q.not(rule.statusColumn, 'in', `(${rule.statusNotIn.join(',')})`)
  if (rule.categoryIn) q = q.in('category', rule.categoryIn)
  if (rule.categoryNotIn) q = q.not('category', 'in', `(${rule.categoryNotIn.join(',')})`)

  return q
}

/** Runs one rule. Never throws: a failure is reported on the outcome. */
export async function sweepRule(
  db: Db,
  rule: RetentionRule,
  options: { dryRun: boolean; now?: Date; deadline?: number }
): Promise<RuleOutcome> {
  const now = options.now ?? new Date()
  const cutoffIso = cutoffFor(rule.days, now).toISOString()
  const outcome: RuleOutcome = {
    id: rule.id,
    table: rule.table,
    days: rule.days,
    reason: rule.reason,
    eligible: 0,
    deleted: 0,
    truncated: false,
  }

  try {
    for (let batch = 0; batch < MAX_BATCHES_PER_RULE; batch += 1) {
      if (options.deadline && Date.now() > options.deadline) {
        outcome.truncated = true
        break
      }

      const table = db.from(rule.table as never) as unknown as {
        select: (columns: string) => Record<string, unknown>
        delete: () => Record<string, unknown>
      }

      const selectQuery = applyFilters(
        table.select(rule.idColumn) as never,
        rule,
        cutoffIso
      ) as unknown as {
        limit: (n: number) => PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>
      }

      const { data, error } = await selectQuery.limit(DELETE_BATCH_SIZE)
      if (error) throw new Error(error.message)

      const ids = (data ?? []).map((row) => row[rule.idColumn]).filter((v) => v !== null && v !== undefined)
      if (ids.length === 0) break

      outcome.eligible += ids.length

      if (!options.dryRun) {
        const deleteQuery = (db.from(rule.table as never) as unknown as {
          delete: () => { in: (c: string, v: readonly unknown[]) => PromiseLike<{ error: { message: string } | null }> }
        })
          .delete()
          .in(rule.idColumn, ids)

        const { error: deleteError } = await deleteQuery
        if (deleteError) throw new Error(deleteError.message)
        outcome.deleted += ids.length
      }

      // In dry-run the rows are still there, so a second pass would count the same
      // ids forever. One page is enough to report the shape of the backlog.
      if (options.dryRun) {
        outcome.truncated = ids.length === DELETE_BATCH_SIZE
        break
      }

      if (ids.length < DELETE_BATCH_SIZE) break
      if (batch === MAX_BATCHES_PER_RULE - 1) outcome.truncated = true
    }
  } catch (err) {
    outcome.error = err instanceof Error ? err.message : String(err)
    // Reported, not thrown: one unreachable table must not stop the other rules.
    log.warnException('retention.rule_failed', err, { rule: rule.id, table: rule.table })
  }

  return outcome
}

/**
 * Sweeps the dated `email_sent_count_YYYY_MM_DD` counters out of `system_settings`.
 *
 * Handled separately because eligibility is the key's shape, not a timestamp —
 * `system_settings` holds live configuration beside these counters, and matching
 * on a loose prefix could reach `email_automations` or `feature_flags`. The
 * pattern is anchored and fully specified, so anything that is not exactly a dated
 * counter is invisible to this sweep.
 */
export async function sweepDailyCounters(
  db: Db,
  options: { dryRun: boolean; now?: Date }
): Promise<RuleOutcome> {
  const outcome: RuleOutcome = {
    id: 'system_settings.daily_counters',
    table: 'system_settings',
    days: 30,
    reason: 'L-11: operational telemetry 30d (dated email_sent_count_* counters only)',
    eligible: 0,
    deleted: 0,
    truncated: false,
  }

  try {
    const { data, error } = await db
      .from('system_settings')
      .select('key')
      .like('key', 'email_sent_count_%')
      .limit(DELETE_BATCH_SIZE)

    if (error) throw new Error(error.message)

    const expired = (data ?? [])
      .map((row) => row.key)
      .filter((key): key is string => typeof key === 'string')
      .filter((key) => isExpiredDailyCounterKey(key, options.now))

    outcome.eligible = expired.length

    if (!options.dryRun && expired.length > 0) {
      const { error: deleteError } = await db.from('system_settings').delete().in('key', expired)
      if (deleteError) throw new Error(deleteError.message)
      outcome.deleted = expired.length
    }
  } catch (err) {
    outcome.error = err instanceof Error ? err.message : String(err)
    log.warnException('retention.rule_failed', err, { rule: outcome.id, table: outcome.table })
  }

  return outcome
}

/** Runs every rule in order, within a time budget. */
export async function runRetentionSweep(
  db: Db,
  options: { dryRun: boolean; now?: Date; budgetMs?: number }
): Promise<SweepResult> {
  const startedAt = new Date()
  const deadline = Date.now() + (options.budgetMs ?? DEFAULT_SWEEP_BUDGET_MS)
  const rules: RuleOutcome[] = []

  log.info('retention.sweep_started', { dryRun: options.dryRun, ruleCount: RETENTION_RULES.length + 1 })

  for (const rule of RETENTION_RULES) {
    if (Date.now() > deadline) break
    rules.push(await sweepRule(db, rule, { dryRun: options.dryRun, now: options.now, deadline }))
  }

  if (Date.now() <= deadline) {
    rules.push(await sweepDailyCounters(db, { dryRun: options.dryRun, now: options.now }))
  }

  const result: SweepResult = {
    dryRun: options.dryRun,
    startedAt: startedAt.toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    totalEligible: rules.reduce((sum, r) => sum + r.eligible, 0),
    totalDeleted: rules.reduce((sum, r) => sum + r.deleted, 0),
    rules,
    budgetExhausted: Date.now() > deadline,
  }

  log.info('retention.sweep_completed', {
    dryRun: result.dryRun,
    totalEligible: result.totalEligible,
    totalDeleted: result.totalDeleted,
    durationMs: result.durationMs,
    budgetExhausted: result.budgetExhausted,
    failedRules: rules.filter((r) => r.error).map((r) => r.id),
  })

  return result
}
