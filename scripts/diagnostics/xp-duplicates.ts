/**
 * B8-D — XP duplicate diagnostic. READ ONLY.
 *
 * Reports existing duplicate `(user_id, source_type, source_id)` rows in `xp_events`,
 * which B8-E must dedupe before it can add a UNIQUE constraint. F-COR-3.
 *
 * THIS SCRIPT DELETES NOTHING. It issues only `SELECT`s through PostgREST and writes a
 * text report to stdout (and optionally to a file). It must stay that way: B8-E owns the
 * destructive half, behind a human approval gate and a fresh backup.
 *
 * It prints user ids only, never emails.
 *
 * Usage, from the repository root:
 *
 *   npx tsx scripts/diagnostics/xp-duplicates.ts
 *   npx tsx scripts/diagnostics/xp-duplicates.ts --out docs/audits/B8D_XP_DUPLICATES_REPORT.txt
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment,
 * or in apps/web/.env.local. The service role key is needed because `xp_events` is not
 * readable with the anon key; it is used for reads only.
 */
import fs from 'node:fs'
import path from 'node:path'

import {
  analyzeDuplicates,
  formatDuplicateReport,
  type XpEventRowForAnalysis,
} from '../../apps/web/lib/xp/duplicate-analysis'

const PAGE_SIZE = 1000

function loadEnv(): { url: string; serviceKey: string } {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL
  let serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    const envPath = path.resolve(process.cwd(), 'apps/web/.env.local')
    if (fs.existsSync(envPath)) {
      for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
        if (!m) continue
        const value = m[2].trim().replace(/^["']|["']$/g, '')
        if (m[1] === 'NEXT_PUBLIC_SUPABASE_URL' && !url) url = value
        if (m[1] === 'SUPABASE_SERVICE_ROLE_KEY' && !serviceKey) serviceKey = value
      }
    }
  }

  if (!url || !serviceKey) {
    console.error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. ' +
        'Set them in the environment or in apps/web/.env.local.'
    )
    process.exit(1)
  }
  return { url, serviceKey }
}

/** Pages the whole table. PostgREST caps each response, so the range walk is required. */
async function fetchAllXpEvents(url: string, serviceKey: string): Promise<XpEventRowForAnalysis[]> {
  const rows: XpEventRowForAnalysis[] = []
  const columns = 'id,user_id,source_type,source_id,xp_amount,created_at'

  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1
    const res = await fetch(
      `${url}/rest/v1/xp_events?select=${columns}&order=created_at.asc,id.asc`,
      {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          Range: `${from}-${to}`,
          'Range-Unit': 'items',
        },
      }
    )

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`xp_events read failed with HTTP ${res.status}: ${body.slice(0, 300)}`)
    }

    const page = (await res.json()) as XpEventRowForAnalysis[]
    rows.push(...page)
    process.stderr.write(`  fetched ${rows.length} rows\r`)
    if (page.length < PAGE_SIZE) break
  }

  process.stderr.write('\n')
  return rows
}

async function main(): Promise<void> {
  const { url, serviceKey } = loadEnv()

  const outFlagIndex = process.argv.indexOf('--out')
  const outPath = outFlagIndex !== -1 ? process.argv[outFlagIndex + 1] : null

  console.error(`Reading xp_events from ${new URL(url).host} (read-only)…`)
  const rows = await fetchAllXpEvents(url, serviceKey)

  const report = analyzeDuplicates(rows)
  const text = formatDuplicateReport(report)

  console.log(text)

  if (outPath) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true })
    fs.writeFileSync(outPath, `${text}\n`, 'utf8')
    console.error(`\nReport written to ${outPath}`)
  }

  console.error('\nNothing was deleted. B8-E requires human review of this report first.')
}

main().catch((err) => {
  console.error(`\nDiagnostic failed: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
