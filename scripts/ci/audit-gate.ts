/**
 * Dependency audit gate (B14-B).
 *
 * `npm audit` on its own is a report, not a gate: it either fails the build on
 * every known advisory — including ones nobody can act on today — or it is made
 * advisory-only and stops meaning anything. This wraps it so that high and
 * critical advisories block by default, and the only way past one is a committed
 * allowlist entry that states why the advisory is accepted and when that
 * judgement must be revisited. An entry past its review date blocks again, so an
 * acceptance cannot quietly become permanent.
 *
 * Moderate and low advisories are reported and never block.
 *
 * Usage (from apps/web, which owns the tsx devDependency):
 *   npx tsx ../../scripts/ci/audit-gate.ts
 */

import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export type Severity = 'info' | 'low' | 'moderate' | 'high' | 'critical'

export interface AuditVia {
  source?: number
  title?: string
  url?: string
  severity?: Severity
}

export interface AuditReport {
  vulnerabilities?: Record<string, { severity: Severity; via?: Array<AuditVia | string> }>
  metadata?: { vulnerabilities?: Partial<Record<Severity | 'total', number>> }
}

export interface AllowlistEntry {
  id: string
  package: string
  reason: string
  reviewBy: string
}

export interface AllowlistFile {
  advisories: AllowlistEntry[]
}

export interface FoundAdvisory {
  id: string
  package: string
  severity: Severity
  title: string
  url: string
}

export interface BlockedAdvisory extends FoundAdvisory {
  kind: 'unreviewed' | 'expired'
  reviewBy?: string
  reason?: string
}

export interface AcceptedAdvisory extends FoundAdvisory {
  reason: string
  reviewBy: string
}

export interface AuditDecision {
  blocked: BlockedAdvisory[]
  accepted: AcceptedAdvisory[]
  stale: AllowlistEntry[]
  exitCode: 0 | 1
}

/** Severities that fail the build unless explicitly accepted. */
export const BLOCKING_SEVERITIES: ReadonlySet<Severity> = new Set<Severity>(['high', 'critical'])

const ADVISORY_ID = /(GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4})/i

/**
 * Collects every blocking advisory in an `npm audit --json` report, keyed by its
 * GHSA id. npm nests advisories under `via`, and the same advisory surfaces
 * through several packages, so ids are deduplicated.
 */
function collectBlockingAdvisories(report: AuditReport): Map<string, FoundAdvisory> {
  const found = new Map<string, FoundAdvisory>()

  for (const [pkg, entry] of Object.entries(report.vulnerabilities ?? {})) {
    for (const via of entry.via ?? []) {
      if (typeof via !== 'object' || !via.url) continue

      const severity = via.severity ?? entry.severity
      if (!BLOCKING_SEVERITIES.has(severity)) continue

      const match = ADVISORY_ID.exec(via.url)
      if (!match) continue
      // GHSA ids are canonically lowercase; the map is keyed case-insensitively
      // so a differently-cased allowlist entry still matches.
      const id = match[1]
      const key = id.toLowerCase()

      if (!found.has(key)) {
        found.set(key, { id, package: pkg, severity, title: via.title ?? '', url: via.url })
      }
    }
  }

  return found
}

function assertUsableAllowlist(allowlist: AllowlistFile): void {
  for (const entry of allowlist.advisories ?? []) {
    if (!entry.reason || entry.reason.trim().length === 0) {
      throw new Error(`Allowlist entry ${entry.id} has no reason. An accepted advisory must say why.`)
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.reviewBy ?? '')) {
      throw new Error(`Allowlist entry ${entry.id} has no reviewBy date (YYYY-MM-DD).`)
    }
  }
}

/**
 * Pure decision function — the part under test.
 *
 * @returns blocked advisories (unreviewed or past review), accepted ones, stale
 *          allowlist entries that no longer match anything, and the exit code.
 */
export function evaluateAudit(
  report: AuditReport,
  allowlist: AllowlistFile,
  now: Date = new Date()
): AuditDecision {
  assertUsableAllowlist(allowlist)

  const accepted: AcceptedAdvisory[] = []
  const blocked: BlockedAdvisory[] = []
  const byId = new Map((allowlist.advisories ?? []).map((a) => [a.id.toLowerCase(), a]))
  const matchedIds = new Set<string>()

  for (const advisory of collectBlockingAdvisories(report).values()) {
    const entry = byId.get(advisory.id.toLowerCase())

    if (!entry) {
      blocked.push({ ...advisory, kind: 'unreviewed' })
      continue
    }

    matchedIds.add(advisory.id.toLowerCase())

    // Day resolution: an entry blocks from the day after its review date.
    if (new Date(`${entry.reviewBy}T23:59:59Z`).getTime() < now.getTime()) {
      blocked.push({ ...advisory, kind: 'expired', reviewBy: entry.reviewBy, reason: entry.reason })
      continue
    }

    accepted.push({ ...advisory, reason: entry.reason, reviewBy: entry.reviewBy })
  }

  const stale = (allowlist.advisories ?? []).filter((a) => !matchedIds.has(a.id.toLowerCase()))

  return { blocked, accepted, stale, exitCode: blocked.length > 0 ? 1 : 0 }
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): { project: string; allowlist: string } {
  const args = { project: 'apps/web', allowlist: 'scripts/ci/npm-audit-allowlist.json' }
  for (let i = 0; i < argv.length; i += 2) {
    if (argv[i] === '--project') args.project = argv[i + 1]
    else if (argv[i] === '--allowlist') args.allowlist = argv[i + 1]
  }
  return args
}

function runNpmAudit(projectDir: string): string {
  try {
    // `npm audit` exits non-zero whenever it finds anything, so a non-zero exit
    // is the normal case here and the JSON on stdout is what matters.
    return execFileSync('npm', ['audit', '--json'], {
      cwd: projectDir,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      shell: process.platform === 'win32',
    })
  } catch (err) {
    const stdout = (err as { stdout?: string }).stdout
    if (typeof stdout === 'string' && stdout.trim().startsWith('{')) return stdout
    throw new Error(`npm audit could not run: ${(err as Error).message}`)
  }
}

function main(): void {
  const { project, allowlist: allowlistPath } = parseArgs(process.argv.slice(2))
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
  const projectDir = path.resolve(repoRoot, project)

  const report = JSON.parse(runNpmAudit(projectDir)) as AuditReport
  const allowlist = JSON.parse(readFileSync(path.resolve(repoRoot, allowlistPath), 'utf8')) as AllowlistFile
  const result = evaluateAudit(report, allowlist)

  const counts = report.metadata?.vulnerabilities ?? {}
  console.log(
    `npm audit (${project}): ${counts.critical ?? 0} critical, ${counts.high ?? 0} high, ` +
      `${counts.moderate ?? 0} moderate, ${counts.low ?? 0} low.`
  )
  console.log('Moderate and low advisories are reported only and never block this gate.\n')

  for (const entry of result.accepted) {
    console.log(`  accepted  ${entry.id} (${entry.severity}, ${entry.package}) - review by ${entry.reviewBy}`)
    console.log(`            ${entry.reason}`)
  }

  for (const entry of result.stale) {
    console.log(
      `::warning title=Stale audit allowlist entry::${entry.id} (${entry.package}) is no longer reported by ` +
        `npm audit. Remove it from ${allowlistPath}.`
    )
  }

  for (const entry of result.blocked) {
    const detail =
      entry.kind === 'expired'
        ? `its acceptance expired on ${entry.reviewBy}. Re-verify the reasoning and set a new review date, or fix the dependency.`
        : `it is not reviewed in ${allowlistPath}. Fix the dependency, or add a reviewed entry stating why it is accepted and when that is revisited.`
    console.log(
      `::error title=Blocking ${entry.severity} advisory in ${entry.package}::${entry.id} - ${entry.title}. ` +
        `${detail} See ${entry.url}`
    )
  }

  if (result.exitCode !== 0) {
    console.log(`\n${result.blocked.length} blocking advisory/advisories. See docs/SECURITY.md section 6.`)
  } else {
    console.log('\nNo unreviewed high or critical advisories.')
  }

  process.exit(result.exitCode)
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main()
}
