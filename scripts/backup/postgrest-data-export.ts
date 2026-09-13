/**
 * Data-only logical export of the production database over PostgREST.
 *
 * ⚠️  THIS IS NOT THE BACKUP DESCRIBED IN FINAL_IMPLEMENTATION_PLAN §18.
 *
 * §18 specifies `pg_dump` run from a dedicated GitHub Actions workflow, gpg-encrypted
 * before upload. That workflow is I-01-B5 and is not implemented, and `pg_dump` cannot
 * be run from a developer workstation that has neither the Postgres client tools nor a
 * container runtime nor the database password.
 *
 * This script is the stopgap that makes a specific destructive migration reversible. It
 * exports table CONTENTS only, through the REST API, using the service-role key.
 *
 * ## What it captures
 *   Every row of every table exposed on the `public` schema, as NDJSON, one file per
 *   table, plus a manifest with per-table row counts and SHA-256 digests.
 *
 * ## What it does NOT capture — read before relying on it
 *   - schema: tables, columns, types, defaults, constraints, indexes
 *   - functions, triggers, RLS policies, grants
 *   - the `auth` schema (auth.users and sessions) — not exposed over PostgREST
 *   - storage objects (avatars, uploads)
 *   - sequence positions
 *   - anything in a schema other than `public`
 *
 * It is sufficient to restore rows deleted by a data migration, because the schema is
 * reproducible from `supabase/migrations/`. It is NOT sufficient for disaster recovery.
 *
 * ## Safety
 *   Read-only. Issues GET requests only. Never writes to the database, and never writes
 *   a credential into its output.
 *
 * Usage, from the repository root:
 *   npx tsx scripts/backup/postgrest-data-export.ts backups/<name>
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

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
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
    process.exit(1)
  }
  return { url, serviceKey }
}

/** Discovers exposed tables from the OpenAPI document rather than a hardcoded list. */
async function listTables(url: string, key: string): Promise<string[]> {
  const res = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  if (!res.ok) throw new Error(`OpenAPI read failed: HTTP ${res.status}`)
  const spec = (await res.json()) as { paths?: Record<string, unknown> }
  return Object.keys(spec.paths || {})
    .filter((p) => p !== '/' && !p.startsWith('/rpc/'))
    .map((p) => p.slice(1))
    .sort()
}

async function exportTable(
  url: string,
  key: string,
  table: string,
  outDir: string
): Promise<{ table: string; rows: number; bytes: number; sha256: string; file: string }> {
  const file = path.join(outDir, `${table}.ndjson`)
  const out = fs.createWriteStream(file, { encoding: 'utf8' })
  const hash = crypto.createHash('sha256')
  let rows = 0
  let bytes = 0

  for (let from = 0; ; from += PAGE_SIZE) {
    const res = await fetch(`${url}/rest/v1/${table}?select=*`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Range: `${from}-${from + PAGE_SIZE - 1}`,
        'Range-Unit': 'items',
      },
    })

    if (!res.ok) {
      out.close()
      throw new Error(`${table}: HTTP ${res.status} — ${(await res.text()).slice(0, 200)}`)
    }

    const page = (await res.json()) as unknown[]
    for (const row of page) {
      const line = `${JSON.stringify(row)}\n`
      out.write(line)
      hash.update(line)
      bytes += Buffer.byteLength(line)
      rows++
    }
    if (page.length < PAGE_SIZE) break
  }

  await new Promise<void>((resolve, reject) => {
    out.end((err?: Error | null) => (err ? reject(err) : resolve()))
  })

  return { table, rows, bytes, sha256: hash.digest('hex'), file: path.basename(file) }
}

async function main(): Promise<void> {
  const outDir = process.argv[2]
  if (!outDir) {
    console.error('Usage: npx tsx scripts/backup/postgrest-data-export.ts <output-directory>')
    process.exit(1)
  }

  const { url, serviceKey } = loadEnv()
  fs.mkdirSync(outDir, { recursive: true })

  const host = new URL(url).host
  console.log(`Exporting from ${host} (read-only) -> ${outDir}`)

  const tables = await listTables(url, serviceKey)
  console.log(`Discovered ${tables.length} exposed tables/views\n`)

  const results = []
  const failures: Array<{ table: string; error: string }> = []

  for (const table of tables) {
    try {
      const r = await exportTable(url, serviceKey, table, outDir)
      results.push(r)
      console.log(`  ${r.table.padEnd(34)} rows=${String(r.rows).padStart(6)}  ${(r.bytes / 1024).toFixed(1)} KiB`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      failures.push({ table, error: message })
      console.error(`  ${table.padEnd(34)} FAILED: ${message}`)
    }
  }

  const manifest = {
    kind: 'postgrest-data-export',
    note: 'DATA ONLY. Not a pg_dump. See the header of scripts/backup/postgrest-data-export.ts.',
    // Host only — never the key, never a connection string.
    sourceHost: host,
    createdAt: new Date().toISOString(),
    tableCount: results.length,
    totalRows: results.reduce((s, r) => s + r.rows, 0),
    totalBytes: results.reduce((s, r) => s + r.bytes, 0),
    tables: results,
    failures,
  }

  fs.writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

  console.log(`\nTables exported: ${results.length}   rows: ${manifest.totalRows}   bytes: ${manifest.totalBytes}`)
  if (failures.length) {
    console.error(`\n${failures.length} table(s) failed — this export is INCOMPLETE.`)
    process.exit(1)
  }
  console.log('manifest.json written. Nothing was modified in the database.')
}

main().catch((err) => {
  console.error(`\nExport failed: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
