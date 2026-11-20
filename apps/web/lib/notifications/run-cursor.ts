import type { createServiceRoleClient } from '@/lib/supabase'
import type { Json } from '@/lib/supabase'

type Client = ReturnType<typeof createServiceRoleClient>

/**
 * Where a paged user job (daily reminder, weekly recap) stopped last time.
 *
 * Those jobs page users by id and stop at a time budget. Without a saved position
 * every run restarted at the first id, so once the user base outgrew one run the
 * same tail of users was cut every hour and never reached. With it, the next run
 * carries on from where the last one stopped; a run that reaches the end clears it,
 * so the following run starts from the top again. Both jobs' send windows stay open
 * for hours and are guarded by per-day idempotency keys, so continuing an hour later
 * still reaches those users and never double-sends.
 *
 * Stored in `system_settings` (key `cron_cursor:<job>`), the same table the cron
 * heartbeat uses. A read failure returns null (start from the top), which is the
 * previous behaviour, never worse.
 */
export async function readRunCursor(client: Client, job: string): Promise<string | null> {
  try {
    const { data, error } = await client
      .from('system_settings')
      .select('value')
      .eq('key', `cron_cursor:${job}`)
      .maybeSingle()
    if (error) return null
    const value = (data as { value?: { lastSeenId?: unknown } } | null)?.value
    return typeof value?.lastSeenId === 'string' && value.lastSeenId ? value.lastSeenId : null
  } catch {
    return null
  }
}

export async function writeRunCursor(client: Client, job: string, lastSeenId: string | null): Promise<void> {
  try {
    await client.from('system_settings').upsert({
      key: `cron_cursor:${job}`,
      value: { lastSeenId } as unknown as Json,
      updated_at: new Date().toISOString(),
    })
  } catch {
    // Best effort: losing the cursor only means the next run starts from the top.
  }
}
