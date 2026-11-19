/**
 * November 2026 database review: held migrations 20261119000001..6, the past-exposure audit,
 * the strict grant allowlist (L3) and the M4 consent carrier.
 *
 * The SQL cannot run here (no database in unit tests, and agents never connect to one), so these
 * tests pin the text: location, the statements that close each finding, a raising self-check,
 * a rollback that restores the original policy text, and validations that only read.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/notifications/dispatcher', () => ({ globalNotificationDispatcher: { dispatch: vi.fn() } }))
vi.mock('@/lib/notifications/events/connectors', () => ({ initializeNotificationConnectors: vi.fn() }))

import { consentFromServerMetadata, SIGNUP_CONSENT_APP_METADATA_KEY } from '@/lib/auth'
import { buildConsentRecord } from '@/lib/legal/consent'

const repoRoot = path.resolve(__dirname, '../../../..')
const migrationsDir = path.join(repoRoot, 'supabase/migrations')
const pendingDir = path.join(migrationsDir, 'pending-approval')
const read = (p: string) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n')
const code = (sql: string) => sql.replace(/--.*$/gm, '')
const EM_DASH = String.fromCharCode(0x2014)

const NAMES = [
  '20261119000001_contact_messages_service_only',
  '20261119000002_system_announcements_service_only',
  '20261119000003_avatars_bucket_hardening',
  '20261119000004_cohort_members_and_friends_lockdown',
  '20261119000005_drop_anon_portfolio_policies',
  '20261119000006_default_privileges_tables_sequences',
] as const

const files = (name: string) => ({
  forward: path.join(pendingDir, `${name}.sql`),
  rollback: path.join(pendingDir, 'rollback', `${name}.down.sql`),
  validation: path.join(pendingDir, 'validation', `${name}_validation.sql`),
})

const AUDIT = path.join(pendingDir, 'validation', '20261119_past_exposure_audit.sql')
const ALLOWLIST = path.join(repoRoot, 'supabase/tests/grant_allowlist.sql')
const README = path.join(pendingDir, 'README.md')

describe.each(NAMES)('held migration %s', (name) => {
  const f = files(name)

  it('lives only under pending-approval, with rollback and validation companions', () => {
    expect(fs.existsSync(f.forward)).toBe(true)
    expect(fs.existsSync(f.rollback)).toBe(true)
    expect(fs.existsSync(f.validation)).toBe(true)
    const ts = name.slice(0, 14)
    for (const dir of [migrationsDir, path.join(migrationsDir, 'rollback'), path.join(migrationsDir, 'validation')]) {
      expect(fs.readdirSync(dir).filter((file) => file.includes(ts))).toEqual([])
    }
  })

  it('says it is held, names its companions and grants nothing to anon or authenticated', () => {
    const sql = read(f.forward)
    expect(sql).toContain('HELD IN pending-approval/')
    expect(sql).toContain(`rollback/${name}.down.sql`)
    expect(sql).toContain(`validation/${name}_validation.sql`)
    expect(code(sql)).not.toMatch(/^\s*GRANT\b[^;]*\b(anon|authenticated|PUBLIC)\b/m)
  })

  it('ends with a self-check DO block that raises', () => {
    const sql = code(read(f.forward))
    const doAt = sql.lastIndexOf('DO $$')
    expect(doAt).toBeGreaterThan(-1)
    expect(sql.slice(doAt)).toMatch(/RAISE EXCEPTION/)
    expect(sql.trimEnd().endsWith('END $$;')).toBe(true)
  })

  it('validation is read-only and rolls back', () => {
    const sql = read(f.validation)
    expect(sql).toMatch(/^BEGIN;$/m)
    expect(sql.trimEnd().endsWith('ROLLBACK;')).toBe(true)
    expect(code(sql)).not.toMatch(/\b(INSERT\s+INTO|UPDATE\s+\w+(\.\w+)?\s+SET|DELETE\s+FROM|ALTER\s|DROP\s|CREATE\s|GRANT\s|REVOKE\s|TRUNCATE\s)/)
    expect(sql).toContain(`${name.slice(0, 14)} validation passed`)
  })

  it('carries no em-dashes', () => {
    for (const p of [f.forward, f.rollback, f.validation]) expect(read(p)).not.toContain(EM_DASH)
  })
})

describe('M2 contact_messages', () => {
  const f = files(NAMES[0])
  it('drops the anon insert policy and revokes writes', () => {
    const sql = code(read(f.forward))
    expect(sql).toContain('DROP POLICY IF EXISTS "Anyone can insert contact message" ON public.contact_messages;')
    expect(sql).toContain('REVOKE INSERT, UPDATE, DELETE ON public.contact_messages FROM PUBLIC, anon, authenticated;')
  })
  it('rollback restores the original policy text', () => {
    const original = read(path.join(migrationsDir, '20260810000002_create_contact_messages_table.sql'))
    expect(original).toContain('WITH CHECK (email IS NOT NULL AND length(trim(email)) > 3 AND length(trim(message)) > 0)')
    expect(read(f.rollback)).toContain('WITH CHECK (email IS NOT NULL AND length(trim(email)) > 3 AND length(trim(message)) > 0);')
  })
})

describe('M3 system_announcements', () => {
  it('drops both policies and all client privileges', () => {
    const sql = code(read(files(NAMES[1]).forward))
    expect(sql).toContain('DROP POLICY IF EXISTS "Active announcements viewable by all" ON public.system_announcements;')
    expect(sql).toContain('DROP POLICY IF EXISTS "Admins manage announcements" ON public.system_announcements;')
    expect(sql).toContain('REVOKE ALL ON public.system_announcements FROM PUBLIC, anon, authenticated;')
  })
  it('matches the app: announcements are only read through the service role', () => {
    const service = read(path.join(repoRoot, 'apps/web/lib/announcements/announcements-service.ts'))
    expect(service).not.toMatch(/createAuthenticatedServerClient|createBrowserSupabaseClient/)
  })
})

describe('M5 avatars bucket', () => {
  const sql = code(read(files(NAMES[2]).forward))
  it('sets the size limit and the image types the avatar service accepts', () => {
    expect(sql).toContain('file_size_limit = 2097152')
    const service = read(path.join(repoRoot, 'apps/web/lib/avatar/avatar-service.ts'))
    const accepted = [...service.matchAll(/'(image\/[a-z]+)',/g)].map((m) => m[1])
    expect(accepted.length).toBeGreaterThan(0)
    for (const type of accepted) expect(sql).toContain(`'${type}'`)
    expect(service).toContain('MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024')
  })
  it('drops the learner write policies and the listing policy', () => {
    for (const policy of [
      'Authenticated users can upload avatars',
      'Authenticated users can update avatars',
      'Authenticated users can delete avatars',
      'Public can view avatars',
    ]) {
      expect(sql).toContain(`DROP POLICY IF EXISTS "${policy}" ON storage.objects;`)
    }
  })
  it('the app writes and lists the bucket only with the service role', () => {
    const service = read(path.join(repoRoot, 'apps/web/lib/avatar/avatar-service.ts'))
    expect(service).toContain("import { createServiceRoleClient } from '@/lib/supabase'")
    expect(service).not.toMatch(/createAuthenticatedServerClient|createBrowserSupabaseClient/)
  })
})

describe('M6 cohort_members and user_friends', () => {
  it('keeps only the own-row cohort SELECT and removes every friends policy', () => {
    const sql = code(read(files(NAMES[3]).forward))
    for (const policy of ['Users can view cohort members', 'Users can join cohorts', 'Users can leave cohorts']) {
      expect(sql).toContain(`DROP POLICY IF EXISTS "${policy}" ON public.cohort_members;`)
    }
    for (const policy of ['Users can view their friends', 'Users can add friends', 'Users can remove friends']) {
      expect(sql).toContain(`DROP POLICY IF EXISTS "${policy}" ON public.user_friends;`)
    }
    expect(sql).not.toContain('DROP POLICY IF EXISTS "Cohort members view cohort"')
    expect(sql).toContain('REVOKE ALL ON public.user_friends FROM PUBLIC, anon, authenticated;')
  })
  it('the routes that touch these tables use the service role', () => {
    for (const route of ['app/api/cohorts/route.ts', 'app/api/friends/route.ts', 'app/api/leaderboard/route.ts']) {
      const src = read(path.join(repoRoot, 'apps/web', route))
      expect(src).toContain('createServiceRoleClient()')
      expect(src).not.toMatch(/createAuthenticatedServerClient|createBrowserSupabaseClient/)
    }
  })
})

describe('L1 public portfolio policies', () => {
  it('drops both anon policies and is ordered before the capstone review feedback migration', () => {
    const sql = read(files(NAMES[4]).forward)
    expect(code(sql)).toContain('DROP POLICY IF EXISTS "Public can view public capstones" ON public.capstone_submissions;')
    expect(code(sql)).toContain('DROP POLICY IF EXISTS "Public can view public reflections" ON public.reflections;')
    expect(sql).toContain('APPLY BEFORE 20261113000004_capstone_review_feedback.sql')
    const readme = read(README)
    expect(readme).toMatch(/20261119000005_drop_anon_portfolio_policies\.sql` \(L1\)\. \*\*Before `20261113000004`/)
  })
})

describe('L2 default privileges', () => {
  it('revokes the postgres defaults for tables and sequences, not for service_role', () => {
    const sql = code(read(files(NAMES[5]).forward))
    expect(sql).toContain('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;')
    expect(sql).toContain('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;')
    expect(sql).not.toMatch(/service_role;/)
  })
})

describe('past exposure audit', () => {
  it('is SELECT-only', () => {
    const sql = code(read(AUDIT))
    expect(sql).not.toMatch(/\b(INSERT\s+INTO|UPDATE\s+\w+(\.\w+)?\s+SET|DELETE\s+FROM|ALTER\s|DROP\s|CREATE\s|GRANT\s|REVOKE\s|TRUNCATE\s|COPY\s|BEGIN;|COMMIT;)/)
    const statements = sql.split(';').map((s) => s.trim()).filter(Boolean)
    expect(statements.length).toBeGreaterThanOrEqual(10)
    for (const statement of statements) expect(statement).toMatch(/^(SELECT|WITH)\b/i)
    expect(read(AUDIT)).not.toContain(EM_DASH)
  })
  it('states a window and the meaning of a hit for every query', () => {
    const raw = read(AUDIT)
    const queries = raw.split(/^-- Q\d+\./m).slice(1)
    expect(queries.length).toBeGreaterThanOrEqual(10)
    for (const q of queries) {
      expect(q).toMatch(/-- WINDOW:/)
      expect(q).toMatch(/-- HIT/)
    }
  })
})

describe('L3 strict grant allowlist', () => {
  const sql = read(ALLOWLIST)
  it('fails through pgTAP instead of warning and passing', () => {
    expect(code(sql)).not.toMatch(/RAISE WARNING/)
    expect(code(sql)).not.toMatch(/extensions\.pass\(/)
    const plan = /extensions\.plan\((\d+)\)/.exec(sql)
    expect(plan).not.toBeNull()
    const assertions = code(sql).match(/SELECT extensions\.is_empty\(/g) ?? []
    expect(assertions.length).toBe(Number(plan?.[1]))
    expect(sql.trimEnd().endsWith('ROLLBACK;')).toBe(true)
  })
  it('names a held migration that exists for every grant it expects to disappear', () => {
    const removedBy = [...code(sql).matchAll(/'(2026\d{10}_[a-z0-9_]+\.sql)'/g)].map((m) => m[1])
    expect(removedBy.length).toBeGreaterThan(0)
    for (const file of new Set(removedBy)) expect(fs.existsSync(path.join(pendingDir, file))).toBe(true)
  })
  it('carries no em-dashes', () => {
    expect(sql).not.toContain(EM_DASH)
  })
})

describe('M4 consent comes only from server-written app_metadata', () => {
  const record = buildConsentRecord(new Date('2026-11-19T10:00:00.000Z'))

  it('reads app_metadata.signup_consent', () => {
    expect(SIGNUP_CONSENT_APP_METADATA_KEY).toBe('signup_consent')
    expect(consentFromServerMetadata({ app_metadata: { provider: 'email', signup_consent: record } })).toEqual(record)
  })

  it('ignores a forged record in user_metadata', () => {
    const forged = { app_metadata: { provider: 'email' }, user_metadata: { ...record } }
    expect(consentFromServerMetadata(forged as never)).toBeNull()
  })

  it('returns null for missing or malformed app_metadata', () => {
    expect(consentFromServerMetadata({ app_metadata: undefined as never })).toBeNull()
    expect(consentFromServerMetadata({ app_metadata: { provider: 'email' } })).toBeNull()
    expect(consentFromServerMetadata({ app_metadata: { signup_consent: 'yes' } })).toBeNull()
    expect(consentFromServerMetadata({ app_metadata: { signup_consent: { terms_version: '2026-09-23' } } })).toBeNull()
  })

  it('lib/auth.ts no longer reads consent from user_metadata', () => {
    const src = read(path.join(repoRoot, 'apps/web/lib/auth.ts'))
    expect(src).not.toMatch(/consentFromAuthMetadata\(\s*user\.user_metadata/)
    expect(src).toContain('consentFromServerMetadata(user)')
  })
})
