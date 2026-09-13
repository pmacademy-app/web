import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { evaluateAudit, type AuditReport, type AllowlistFile } from '../../../../scripts/ci/audit-gate'

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../..')
const NOW = new Date('2026-09-14T00:00:00Z')

function report(vulnerabilities: AuditReport['vulnerabilities']): AuditReport {
  return {
    vulnerabilities,
    metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 } },
  }
}

const allowlist: AllowlistFile = {
  advisories: [
    {
      id: 'GHSA-aaaa-aaaa-aaaa',
      package: 'demo',
      reason: 'Not reachable: the vulnerable code path is build-only.',
      reviewBy: '2026-12-01',
    },
  ],
}

describe('B14-B — npm audit gate', () => {
  it('passes when there are no high or critical advisories', () => {
    const result = evaluateAudit(report({}), allowlist, NOW)

    expect(result.blocked).toEqual([])
    expect(result.exitCode).toBe(0)
  })

  it('never blocks on moderate or low advisories', () => {
    const result = evaluateAudit(
      report({
        squishy: {
          severity: 'moderate',
          via: [{ source: 1, title: 'thing', url: 'https://github.com/advisories/GHSA-mod1-mod1-mod1', severity: 'moderate' }],
        },
      }),
      allowlist,
      NOW
    )

    expect(result.blocked).toEqual([])
    expect(result.exitCode).toBe(0)
  })

  it('blocks an unreviewed high advisory', () => {
    const result = evaluateAudit(
      report({
        risky: {
          severity: 'high',
          via: [{ source: 2, title: 'bad', url: 'https://github.com/advisories/GHSA-bbbb-bbbb-bbbb', severity: 'high' }],
        },
      }),
      allowlist,
      NOW
    )

    expect(result.exitCode).toBe(1)
    expect(result.blocked).toHaveLength(1)
    expect(result.blocked[0].id).toBe('GHSA-bbbb-bbbb-bbbb')
    expect(result.blocked[0].kind).toBe('unreviewed')
  })

  it('blocks a critical advisory even when a moderate one is present', () => {
    const result = evaluateAudit(
      report({
        risky: {
          severity: 'critical',
          via: [{ source: 3, title: 'rce', url: 'https://github.com/advisories/GHSA-cccc-cccc-cccc', severity: 'critical' }],
        },
      }),
      allowlist,
      NOW
    )

    expect(result.exitCode).toBe(1)
    expect(result.blocked[0].severity).toBe('critical')
  })

  it('accepts an allowlisted advisory whose review date has not passed', () => {
    const result = evaluateAudit(
      report({
        demo: {
          severity: 'high',
          via: [{ source: 4, title: 'known', url: 'https://github.com/advisories/GHSA-aaaa-aaaa-aaaa', severity: 'high' }],
        },
      }),
      allowlist,
      NOW
    )

    expect(result.exitCode).toBe(0)
    expect(result.accepted.map((a) => a.id)).toEqual(['GHSA-aaaa-aaaa-aaaa'])
  })

  it('blocks an allowlisted advisory once its review date has passed', () => {
    const expired = new Date('2026-12-02T00:00:00Z')
    const result = evaluateAudit(
      report({
        demo: {
          severity: 'high',
          via: [{ source: 4, title: 'known', url: 'https://github.com/advisories/GHSA-aaaa-aaaa-aaaa', severity: 'high' }],
        },
      }),
      allowlist,
      expired
    )

    expect(result.exitCode).toBe(1)
    expect(result.blocked[0].kind).toBe('expired')
  })

  it('reports a stale allowlist entry without failing the gate', () => {
    const result = evaluateAudit(report({}), allowlist, NOW)

    expect(result.stale.map((s) => s.id)).toEqual(['GHSA-aaaa-aaaa-aaaa'])
    expect(result.exitCode).toBe(0)
  })

  it('rejects an allowlist entry that carries no reason or review date', () => {
    const bad = { advisories: [{ id: 'GHSA-dddd-dddd-dddd', package: 'x', reason: '', reviewBy: '' }] }

    expect(() => evaluateAudit(report({}), bad as AllowlistFile, NOW)).toThrow(/reason/)
  })
})

describe('B14-B — CI security configuration is present', () => {
  const ci = readFileSync(path.join(REPO_ROOT, '.github/workflows/ci.yml'), 'utf8')

  it('defines a dependabot configuration for npm and github-actions', () => {
    const dependabotPath = path.join(REPO_ROOT, '.github/dependabot.yml')
    expect(existsSync(dependabotPath)).toBe(true)

    const dependabot = readFileSync(dependabotPath, 'utf8')
    expect(dependabot).toContain('package-ecosystem: "npm"')
    expect(dependabot).toContain('package-ecosystem: "github-actions"')
  })

  it('runs the dependency audit gate and the secret scan in CI', () => {
    expect(ci).toContain('scripts/ci/audit-gate.ts')
    expect(ci).toContain('gitleaks')
  })

  it('does not let the security job be skipped or soft-failed', () => {
    expect(ci).not.toContain('continue-on-error: true')
    expect(ci).not.toMatch(/npm audit[^\n]*\|\|\s*true/)
  })

  it('keeps the migration deploy gated on the existing build job only', () => {
    expect(ci).toMatch(/deploy-supabase:\s*\n\s*needs:\s*build-and-validate/)
  })

  it('ships an allowlist in which every entry carries a reason and a review date', () => {
    const raw = JSON.parse(
      readFileSync(path.join(REPO_ROOT, 'scripts/ci/npm-audit-allowlist.json'), 'utf8')
    ) as AllowlistFile

    expect(raw.advisories.length).toBeGreaterThan(0)
    for (const entry of raw.advisories) {
      expect(entry.id).toMatch(/^GHSA-/)
      expect(entry.reason.length).toBeGreaterThan(20)
      expect(entry.reviewBy).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })
})
