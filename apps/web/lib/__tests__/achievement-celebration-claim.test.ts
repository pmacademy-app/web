/**
 * Achievement celebration claim (Task 10 backend).
 *
 * `claimNextAchievementCelebration` picks ONE unread achievement notification, verifies it
 * against its source row, and marks it read with a compare-and-set so exactly one tab or
 * device gets to show the celebration. These tests run it against an in-memory fake that
 * behaves like the tables it reads: filters are evaluated against live rows at the moment a
 * query executes (so a concurrent claim really does lose), and anything the fake does not
 * model — an unknown method, table or column — throws instead of silently succeeding.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/supabase'
import * as authLib from '../auth'
import * as supabaseLib from '../supabase'
import { ACHIEVEMENT_CELEBRATIONS_PATH } from '../api/contracts/achievement-celebration'
import { getLessonIdsForModule } from '../curriculum-registry'
import { DEFAULT_FEATURE_FLAGS, globalFeatureFlagService } from '../notifications/feature-flags/service'
import {
  ACHIEVEMENT_CELEBRATION_KEY_PREFIXES,
  claimNextAchievementCelebration,
} from '../notifications/in-app/achievement-celebrations'

const WEB_ROOT = path.resolve(import.meta.dirname, '../..')
const readSource = (relativePath: string) => readFileSync(path.join(WEB_ROOT, relativePath), 'utf8')

const USER = '11111111-1111-4111-8111-111111111111'
const OTHER_USER = '22222222-2222-4222-8222-222222222222'
const SUBMISSION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const NOW = new Date('2026-10-09T12:00:00.000Z')
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()
const ahead = (ms: number) => new Date(NOW.getTime() + ms).toISOString()

// ─── The fake ────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>
type TableName = 'in_app_notifications' | 'users' | 'certificates' | 'capstone_submissions' | 'user_lesson_progress'

/** The real columns (types/database.ts). Selecting or filtering on anything else throws. */
const COLUMNS: Record<TableName, readonly string[]> = {
  in_app_notifications: [
    'id', 'user_id', 'event_id', 'category', 'title', 'body', 'action_url', 'priority',
    'is_read', 'read_at', 'expires_at', 'created_at', 'idempotency_key', 'celebrated_at',
  ],
  users: ['id', 'username', 'name', 'email', 'is_portfolio_public', 'is_fellow'],
  certificates: [
    'id', 'user_id', 'certificate_code', 'type', 'module_slug', 'issued_at', 'career_title',
    'learner_name', 'level', 'total_xp', 'lessons_completed', 'modules_completed',
  ],
  capstone_submissions: [
    'id', 'user_id', 'module_slug', 'status', 'is_public', 'content', 'submitted_at',
    'reviewed_at', 'reviewed_by',
  ],
  user_lesson_progress: ['user_id', 'lesson_id', 'status', 'quiz_score', 'quiz_attempts', 'completed_at'],
}

interface Filter {
  op: 'eq' | 'gte' | 'gt' | 'in' | 'or' | 'is'
  column: string
  value: unknown
}

interface QueryRecord {
  table: TableName
  kind: 'select' | 'update'
  columns: string | null
  payload: Row | null
  filters: Filter[]
}

const BUILDER_METHODS = ['select', 'update', 'eq', 'is', 'gte', 'gt', 'in', 'or', 'order', 'limit', 'maybeSingle', 'then']

function createFakeSupabase(seed: Partial<Record<TableName, Row[]>> = {}) {
  const tables: Record<TableName, Row[]> = {
    in_app_notifications: [],
    users: [],
    certificates: [],
    capstone_submissions: [],
    user_lesson_progress: [],
  }
  for (const [name, rows] of Object.entries(seed)) {
    tables[name as TableName] = rows.map((row) => ({ ...row }))
  }

  /** Every query that executed, in order. */
  const queries: QueryRecord[] = []
  /** Anything the code under test asked for that the fake does not model. */
  const violations: string[] = []
  /** `${table}:${kind}` → the error that query should resolve with. */
  const failures = new Map<string, { message: string; code: string }>()
  const hooks: { beforeUpdate: ((query: QueryRecord) => void) | null } = { beforeUpdate: null }

  const violate = (message: string): never => {
    violations.push(message)
    throw new Error(`[fake supabase] ${message}`)
  }

  const assertColumn = (table: TableName, column: string) => {
    if (!COLUMNS[table].includes(column)) violate(`unknown column ${table}.${column}`)
  }

  const matches = (table: TableName, row: Row, filter: Filter): boolean => {
    switch (filter.op) {
      case 'eq':
        return row[filter.column] === filter.value
      case 'is':
        // Only the shape the claim uses: `.is(column, null)`.
        if (filter.value !== null) return violate(`unsupported is() value on ${filter.column}`)
        return row[filter.column] === null || row[filter.column] === undefined
      case 'gte':
        return Date.parse(String(row[filter.column])) >= Date.parse(String(filter.value))
      case 'gt':
        return Date.parse(String(row[filter.column])) > Date.parse(String(filter.value))
      case 'in':
        return (filter.value as unknown[]).includes(row[filter.column])
      case 'or':
        // Only the shape the claim uses: `col.like.prefix%,col.like.prefix%`.
        return String(filter.value)
          .split(',')
          .some((clause) => {
            const parsed = /^([a-z_]+)\.like\.([^%*]+)%$/.exec(clause)
            if (!parsed) return violate(`unsupported or() clause "${clause}"`)
            assertColumn(table, parsed[1])
            const cell = row[parsed[1]]
            return typeof cell === 'string' && cell.startsWith(parsed[2])
          })
    }
  }

  const project = (table: TableName, row: Row, columns: string | null): Row => {
    if (!columns || columns.trim() === '*') return { ...row }
    const projected: Row = {}
    for (const column of columns.split(',').map((c) => c.trim())) {
      assertColumn(table, column)
      projected[column] = row[column] ?? null
    }
    return projected
  }

  const from = (table: string) => {
    if (!(table in tables)) violate(`unknown table ${table}`)
    const name = table as TableName
    const state = {
      kind: null as 'select' | 'update' | null,
      columns: null as string | null,
      returning: null as string | null,
      payload: null as Row | null,
      filters: [] as Filter[],
      order: null as { column: string; ascending: boolean } | null,
      limit: null as number | null,
      single: false,
    }

    const addFilter = (op: Filter['op'], column: string, value: unknown) => {
      if (op !== 'or') assertColumn(name, column)
      state.filters.push({ op, column, value })
      return builder
    }

    const execute = async (): Promise<{ data: unknown; error: unknown }> => {
      // A macrotask, so two concurrent claims genuinely interleave: both read before
      // either writes, exactly as two tabs would.
      await new Promise((resolve) => setTimeout(resolve, 0))
      if (!state.kind) return violate(`query on ${name} executed without select() or update()`)

      const record: QueryRecord = {
        table: name,
        kind: state.kind,
        columns: state.kind === 'select' ? state.columns : state.returning,
        payload: state.payload,
        filters: [...state.filters],
      }
      queries.push(record)

      const failure = failures.get(`${name}:${state.kind}`)
      if (failure) return { data: null, error: failure }

      if (state.kind === 'update') {
        hooks.beforeUpdate?.(record)
        // Filters are evaluated here, against the rows as they are NOW.
        const matched = tables[name].filter((row) => state.filters.every((f) => matches(name, row, f)))
        for (const row of matched) Object.assign(row, state.payload)
        return {
          data: state.returning ? matched.map((row) => project(name, row, state.returning)) : null,
          error: null,
        }
      }

      let rows = tables[name].filter((row) => state.filters.every((f) => matches(name, row, f)))
      if (state.order) {
        const { column, ascending } = state.order
        rows = [...rows].sort((a, b) => {
          const left = String(a[column])
          const right = String(b[column])
          return (left < right ? -1 : left > right ? 1 : 0) * (ascending ? 1 : -1)
        })
      }
      if (state.limit !== null) rows = rows.slice(0, state.limit)
      const projected = rows.map((row) => project(name, row, state.columns))
      if (!state.single) return { data: projected, error: null }
      if (projected.length > 1) {
        return { data: null, error: { message: 'multiple rows returned', code: 'PGRST116' } }
      }
      return { data: projected[0] ?? null, error: null }
    }

    const target = {
      select(columns?: string) {
        if (state.kind === 'update') state.returning = columns ?? '*'
        else {
          state.kind = 'select'
          state.columns = columns ?? '*'
        }
        return builder
      },
      update(payload: Row) {
        if (state.kind) violate(`update() after ${state.kind}() on ${name}`)
        for (const column of Object.keys(payload)) assertColumn(name, column)
        state.kind = 'update'
        state.payload = payload
        return builder
      },
      eq: (column: string, value: unknown) => addFilter('eq', column, value),
      is: (column: string, value: unknown) => addFilter('is', column, value),
      gte: (column: string, value: unknown) => addFilter('gte', column, value),
      gt: (column: string, value: unknown) => addFilter('gt', column, value),
      in: (column: string, values: unknown[]) => addFilter('in', column, values),
      or: (expression: string) => addFilter('or', '', expression),
      order(column: string, options?: { ascending?: boolean }) {
        assertColumn(name, column)
        state.order = { column, ascending: options?.ascending !== false }
        return builder
      },
      limit(count: number) {
        state.limit = count
        return builder
      },
      maybeSingle() {
        state.single = true
        return builder
      },
      then<A, B>(
        onFulfilled?: (value: { data: unknown; error: unknown }) => A,
        onRejected?: (reason: unknown) => B
      ) {
        return execute().then(onFulfilled, onRejected)
      },
    }

    // No silent no-ops: a chain method the fake does not model is a test failure, not a
    // pass-through, so a new query shape cannot slip past these tests unexamined.
    const builder: typeof target = new Proxy(target, {
      get(obj, prop, receiver) {
        if (typeof prop === 'string' && !BUILDER_METHODS.includes(prop)) {
          return violate(`unsupported query method ${name}.${prop}()`)
        }
        return Reflect.get(obj, prop, receiver)
      },
    })
    return builder
  }

  const client = new Proxy({ from } as Record<string, unknown>, {
    get(obj, prop, receiver) {
      if (typeof prop === 'string' && prop !== 'from') return violate(`unsupported client member ${prop}`)
      return Reflect.get(obj, prop, receiver)
    },
  })

  return {
    client: client as unknown as SupabaseClient<Database>,
    tables,
    queries,
    violations,
    failures,
    hooks,
    notification: (id: string) => tables.in_app_notifications.find((row) => row.id === id),
    updates: () => queries.filter((query) => query.kind === 'update'),
    queriesOn: (table: TableName) => queries.filter((query) => query.table === table),
  }
}

type FakeDb = ReturnType<typeof createFakeSupabase>

// ─── Seed helpers ────────────────────────────────────────────────────────────

function notificationRow(id: string, idempotencyKey: string, overrides: Row = {}): Row {
  return {
    id,
    user_id: USER,
    event_id: idempotencyKey,
    idempotency_key: idempotencyKey,
    category: 'achievements',
    title: 'An achievement',
    body: 'Something worth celebrating.',
    action_url: null,
    priority: 2,
    is_read: false,
    read_at: null,
    celebrated_at: null,
    created_at: ago(HOUR_MS),
    expires_at: ahead(44 * DAY_MS),
    ...overrides,
  }
}

function userRow(overrides: Row = {}): Row {
  return {
    id: USER,
    username: 'ada',
    name: 'Ada Lovelace',
    email: 'ada@example.test',
    is_portfolio_public: true,
    is_fellow: false,
    ...overrides,
  }
}

function certificateRow(code: string, overrides: Row = {}): Row {
  return {
    id: `cert-row-${code}`,
    user_id: USER,
    certificate_code: code,
    type: 'full_curriculum',
    module_slug: null,
    issued_at: '2026-10-09T10:00:00.000Z',
    career_title: 'Senior Product Manager',
    learner_name: 'Ada Lovelace',
    level: 12,
    total_xp: 9000,
    lessons_completed: 90,
    modules_completed: 9,
    ...overrides,
  }
}

function capstoneRow(id: string, overrides: Row = {}): Row {
  return {
    id,
    user_id: USER,
    module_slug: 'discovery',
    status: 'reviewed',
    is_public: true,
    content: 'A capstone write-up.',
    submitted_at: '2026-10-01T10:00:00.000Z',
    reviewed_at: '2026-10-09T09:00:00.000Z',
    reviewed_by: OTHER_USER,
    ...overrides,
  }
}

const claim = (db: FakeDb) =>
  claimNextAchievementCelebration(db.client, USER, { now: NOW, siteOrigin: 'https://example.test/' })

let db: FakeDb

afterEach(() => {
  // Every test ends by proving the code only issued queries the fake understands.
  expect(db?.violations ?? []).toEqual([])
  vi.restoreAllMocks()
})

// ─── Certificates ────────────────────────────────────────────────────────────

describe('claimNextAchievementCelebration — certificates', () => {
  it('claims a verified certificate and returns code, type, careerTitle and verificationUrl', async () => {
    db = createFakeSupabase({
      users: [userRow()],
      in_app_notifications: [notificationRow('n-cert', 'certificate-generated-PMA-2026-AAAA1111')],
      certificates: [certificateRow('PMA-2026-AAAA1111')],
    })

    const celebration = await claim(db)

    expect(celebration).toEqual({
      kind: 'certificate',
      notificationId: 'n-cert',
      portfolio: { username: 'ada', displayName: 'Ada Lovelace', isPublic: true },
      certificate: {
        code: 'PMA-2026-AAAA1111',
        type: 'full_curriculum',
        moduleSlug: null,
        moduleTitle: null,
        issuedAt: '2026-10-09T10:00:00.000Z',
        careerTitle: 'Senior Product Manager',
        verificationUrl: 'https://example.test/verify/PMA-2026-AAAA1111',
      },
    })
    expect(db.notification('n-cert')).toMatchObject({ is_read: true, read_at: NOW.toISOString() })
  })

  it('normalises a module certificate type and resolves its module title', async () => {
    db = createFakeSupabase({
      users: [userRow()],
      in_app_notifications: [notificationRow('n-cert', 'certificate-generated-PMA-2026-BBBB2222')],
      certificates: [
        certificateRow('PMA-2026-BBBB2222', { type: 'module_completion', module_slug: 'discovery' }),
      ],
    })

    const celebration = await claim(db)

    expect(celebration).toMatchObject({
      kind: 'certificate',
      certificate: { type: 'module', moduleSlug: 'discovery', moduleTitle: 'Users, Problems & Discovery' },
    })
  })

  it('skips a TEST- certificate and leaves it unread', async () => {
    db = createFakeSupabase({
      users: [userRow()],
      in_app_notifications: [notificationRow('n-test', 'certificate-generated-TEST-PMA-2026-AAAA1111-x1')],
      certificates: [certificateRow('TEST-PMA-2026-AAAA1111-x1')],
    })

    expect(await claim(db)).toBeNull()
    expect(db.notification('n-test')).toMatchObject({ is_read: false, read_at: null })
    expect(db.updates()).toEqual([])
  })

  it('skips a certificate owned by another user', async () => {
    db = createFakeSupabase({
      users: [userRow()],
      in_app_notifications: [notificationRow('n-cert', 'certificate-generated-PMA-2026-CCCC3333')],
      certificates: [certificateRow('PMA-2026-CCCC3333', { user_id: OTHER_USER })],
    })

    expect(await claim(db)).toBeNull()
    expect(db.notification('n-cert')).toMatchObject({ is_read: false, read_at: null })
    expect(db.updates()).toEqual([])
  })

  it('skips a certificate notification whose certificate row no longer exists', async () => {
    db = createFakeSupabase({
      users: [userRow()],
      in_app_notifications: [notificationRow('n-cert', 'certificate-generated-PMA-2026-DDDD4444')],
    })

    expect(await claim(db)).toBeNull()
    expect(db.notification('n-cert')).toMatchObject({ is_read: false })
  })
})

// ─── Capstones ───────────────────────────────────────────────────────────────

describe('claimNextAchievementCelebration — capstones', () => {
  it('claims a published capstone', async () => {
    db = createFakeSupabase({
      users: [userRow({ is_portfolio_public: false })],
      in_app_notifications: [notificationRow('n-cap', `capstone-reviewed-${SUBMISSION}`)],
      capstone_submissions: [capstoneRow(SUBMISSION)],
    })

    expect(await claim(db)).toEqual({
      kind: 'capstone',
      notificationId: 'n-cap',
      portfolio: { username: 'ada', displayName: 'Ada Lovelace', isPublic: false },
      capstone: { moduleSlug: 'discovery', moduleTitle: 'Users, Problems & Discovery' },
    })
    expect(db.notification('n-cap')).toMatchObject({ is_read: true, read_at: NOW.toISOString() })
  })

  it('skips a rejected capstone (reviewed, is_public = false) and leaves it unread', async () => {
    db = createFakeSupabase({
      users: [userRow()],
      in_app_notifications: [notificationRow('n-cap', `capstone-reviewed-${SUBMISSION}`)],
      capstone_submissions: [capstoneRow(SUBMISSION, { is_public: false })],
    })

    expect(await claim(db)).toBeNull()
    expect(db.notification('n-cap')).toMatchObject({ is_read: false, read_at: null })
    expect(db.updates()).toEqual([])
  })

  it('skips a capstone that is public but not in the reviewed state', async () => {
    db = createFakeSupabase({
      users: [userRow()],
      in_app_notifications: [notificationRow('n-cap', `capstone-reviewed-${SUBMISSION}`)],
      capstone_submissions: [capstoneRow(SUBMISSION, { status: 'submitted' })],
    })

    expect(await claim(db)).toBeNull()
    expect(db.notification('n-cap')).toMatchObject({ is_read: false })
  })

  it('skips a capstone submitted by another user', async () => {
    db = createFakeSupabase({
      users: [userRow()],
      in_app_notifications: [notificationRow('n-cap', `capstone-reviewed-${SUBMISSION}`)],
      capstone_submissions: [capstoneRow(SUBMISSION, { user_id: OTHER_USER })],
    })

    expect(await claim(db)).toBeNull()
    expect(db.notification('n-cap')).toMatchObject({ is_read: false })
  })

  it('never queries capstone_submissions for a key suffix that is not a UUID', async () => {
    db = createFakeSupabase({
      users: [userRow()],
      in_app_notifications: [notificationRow('n-cap', 'capstone-reviewed-not-a-uuid')],
    })

    expect(await claim(db)).toBeNull()
    expect(db.queriesOn('capstone_submissions')).toEqual([])
    expect(db.notification('n-cap')).toMatchObject({ is_read: false })
  })
})

// ─── Fellow ──────────────────────────────────────────────────────────────────

describe('claimNextAchievementCelebration — fellow', () => {
  // Growth R5 P1: grants since R5 carry the grant time, so a re-grant celebrates again.
  it('claims a per-grant key that names the caller', async () => {
    db = createFakeSupabase({
      users: [userRow({ is_fellow: true })],
      in_app_notifications: [notificationRow('n-regrant', `fellow-granted-${USER}-1791590400000`)],
    })
    expect(await claim(db)).toMatchObject({ kind: 'fellow', notificationId: 'n-regrant' })
  })

  it.each([
    ['another learner', `fellow-granted-${OTHER_USER}-1791590400000`],
    ['a non-numeric suffix', `fellow-granted-${USER}-abc`],
  ])('rejects a per-grant key naming %s', async (_label, key) => {
    db = createFakeSupabase({
      users: [userRow({ is_fellow: true })],
      in_app_notifications: [notificationRow('n-bad', key)],
    })
    expect(await claim(db)).toBeNull()
    expect(db.notification('n-bad')).toMatchObject({ is_read: false })
  })

  it('claims the fellow grant for a current fellow', async () => {
    db = createFakeSupabase({
      users: [userRow({ is_fellow: true, username: null, name: null })],
      in_app_notifications: [notificationRow('n-fellow', `fellow-granted-${USER}`)],
    })

    expect(await claim(db)).toEqual({
      kind: 'fellow',
      notificationId: 'n-fellow',
      portfolio: { username: null, displayName: null, isPublic: true },
    })
    expect(db.notification('n-fellow')).toMatchObject({ is_read: true })
  })

  it('skips fellow when is_fellow is false', async () => {
    db = createFakeSupabase({
      users: [userRow({ is_fellow: false })],
      in_app_notifications: [notificationRow('n-fellow', `fellow-granted-${USER}`)],
    })

    expect(await claim(db)).toBeNull()
    expect(db.notification('n-fellow')).toMatchObject({ is_read: false, read_at: null })
    expect(db.updates()).toEqual([])
  })

  it('skips a fellow key whose suffix is not the caller', async () => {
    db = createFakeSupabase({
      users: [userRow({ is_fellow: true })],
      in_app_notifications: [notificationRow('n-fellow', `fellow-granted-${OTHER_USER}`)],
    })

    expect(await claim(db)).toBeNull()
    expect(db.notification('n-fellow')).toMatchObject({ is_read: false, read_at: null })
    expect(db.updates()).toEqual([])
  })
})

// ─── Selection, ordering and the claim itself ────────────────────────────────

describe('claimNextAchievementCelebration — selection and ordering', () => {
  const everything = () =>
    createFakeSupabase({
      users: [userRow({ is_fellow: true })],
      in_app_notifications: [
        // Deliberately seeded so creation order disagrees with kind order.
        notificationRow('n-cap', `capstone-reviewed-${SUBMISSION}`, { created_at: ago(5 * DAY_MS) }),
        notificationRow('n-cert-new', 'certificate-generated-PMA-2026-NEW00002', { created_at: ago(DAY_MS) }),
        notificationRow('n-cert-old', 'certificate-generated-PMA-2026-OLD00001', { created_at: ago(3 * DAY_MS) }),
        notificationRow('n-fellow', `fellow-granted-${USER}`, { created_at: ago(HOUR_MS) }),
      ],
      certificates: [
        certificateRow('PMA-2026-OLD00001', { type: 'module_completion', module_slug: 'foundations' }),
        certificateRow('PMA-2026-NEW00002'),
      ],
      capstone_submissions: [capstoneRow(SUBMISSION)],
    })

  it('orders fellow > certificate > capstone, oldest first within a kind, one per call', async () => {
    db = everything()

    const claimed: Array<string | null> = []
    for (let call = 0; call < 5; call++) {
      const celebration = await claim(db)
      claimed.push(celebration ? celebration.notificationId : null)
      // Exactly one row is marked read by each successful call — never the whole batch.
      const readCount = db.tables.in_app_notifications.filter((row) => row.is_read === true).length
      expect(readCount).toBe(Math.min(call + 1, 4))
    }

    expect(claimed).toEqual(['n-fellow', 'n-cert-old', 'n-cert-new', 'n-cap', null])
  })

  it('ignores unread notifications that are not achievements', async () => {
    db = createFakeSupabase({
      users: [userRow()],
      in_app_notifications: [
        notificationRow('n-lesson', 'lesson-completed-les_zoyq8a'),
        notificationRow('n-null-key', 'placeholder', { idempotency_key: null }),
      ],
    })

    expect(await claim(db)).toBeNull()
    expect(db.updates()).toEqual([])
    // Nothing claimable, so the caller's profile is never even read.
    expect(db.queriesOn('users')).toEqual([])
  })

  // Growth R5 P2: reading a notification in the bell no longer uses up its celebration.
  it('still celebrates a notification already read in the bell, keeping its read_at', async () => {
    db = createFakeSupabase({
      users: [userRow()],
      in_app_notifications: [
        notificationRow('n-cert', 'certificate-generated-PMA-2026-AAAA1111', {
          is_read: true,
          read_at: ago(HOUR_MS),
        }),
      ],
      certificates: [certificateRow('PMA-2026-AAAA1111')],
    })

    expect(await claim(db)).toMatchObject({ kind: 'certificate', notificationId: 'n-cert' })
    expect(db.updates()[0].payload).toEqual({ celebrated_at: NOW.toISOString(), is_read: true })
    expect(db.notification('n-cert')).toMatchObject({ read_at: ago(HOUR_MS), celebrated_at: NOW.toISOString() })
  })

  it('ignores already-celebrated achievement notifications', async () => {
    db = createFakeSupabase({
      users: [userRow()],
      in_app_notifications: [
        notificationRow('n-cert', 'certificate-generated-PMA-2026-AAAA1111', {
          is_read: true,
          read_at: ago(HOUR_MS),
          celebrated_at: ago(HOUR_MS),
        }),
      ],
      certificates: [certificateRow('PMA-2026-AAAA1111')],
    })

    expect(await claim(db)).toBeNull()
    expect(db.updates()).toEqual([])
  })

  it('excludes rows older than 14 days and expired rows', async () => {
    db = createFakeSupabase({
      users: [userRow()],
      in_app_notifications: [
        notificationRow('n-stale', 'certificate-generated-PMA-2026-AAAA1111', {
          created_at: ago(14 * DAY_MS + HOUR_MS),
        }),
        notificationRow('n-expired', 'certificate-generated-PMA-2026-BBBB2222', {
          expires_at: ago(HOUR_MS),
        }),
      ],
      certificates: [certificateRow('PMA-2026-AAAA1111'), certificateRow('PMA-2026-BBBB2222')],
    })

    expect(await claim(db)).toBeNull()
    expect(db.notification('n-stale')).toMatchObject({ is_read: false })
    expect(db.notification('n-expired')).toMatchObject({ is_read: false })
    expect(db.queriesOn('certificates')).toEqual([])
  })

  it('still claims a row just inside the 14 day window', async () => {
    db = createFakeSupabase({
      users: [userRow()],
      in_app_notifications: [
        notificationRow('n-cert', 'certificate-generated-PMA-2026-AAAA1111', {
          created_at: ago(14 * DAY_MS - HOUR_MS),
        }),
      ],
      certificates: [certificateRow('PMA-2026-AAAA1111')],
    })

    expect(await claim(db)).toMatchObject({ notificationId: 'n-cert' })
  })

  it('never claims another user’s notification', async () => {
    db = createFakeSupabase({
      users: [userRow(), userRow({ id: OTHER_USER, username: 'grace', is_fellow: true })],
      in_app_notifications: [
        notificationRow('n-theirs', 'certificate-generated-PMA-2026-AAAA1111', { user_id: OTHER_USER }),
      ],
      certificates: [certificateRow('PMA-2026-AAAA1111', { user_id: OTHER_USER })],
    })

    expect(await claim(db)).toBeNull()
    expect(db.notification('n-theirs')).toMatchObject({ is_read: false })
  })

  it('scopes every select and the claiming update by the caller’s user id', async () => {
    db = createFakeSupabase({
      users: [userRow({ is_fellow: false })],
      in_app_notifications: [
        notificationRow('n-fellow', `fellow-granted-${USER}`),
        notificationRow('n-cert', 'certificate-generated-TEST-PMA-2026-AAAA1111-x1'),
        notificationRow('n-cert-missing', 'certificate-generated-PMA-2026-MISSING1'),
        notificationRow('n-cap', `capstone-reviewed-${SUBMISSION}`),
      ],
      capstone_submissions: [capstoneRow(SUBMISSION)],
    })

    expect(await claim(db)).toMatchObject({ kind: 'capstone' })

    // The run touched every table the claim can touch, including the update.
    expect(new Set(db.queries.map((query) => `${query.table}:${query.kind}`))).toEqual(
      new Set([
        'in_app_notifications:select',
        'users:select',
        'certificates:select',
        'capstone_submissions:select',
        'in_app_notifications:update',
      ])
    )

    for (const query of db.queries) {
      const ownerColumn = query.table === 'users' ? 'id' : 'user_id'
      expect(query.filters, `${query.table}:${query.kind}`).toContainEqual({
        op: 'eq',
        column: ownerColumn,
        value: USER,
      })
    }
  })

  it('claims with a compare-and-set on id, user and celebrated_at IS NULL', async () => {
    db = createFakeSupabase({
      users: [userRow()],
      in_app_notifications: [notificationRow('n-cert', 'certificate-generated-PMA-2026-AAAA1111')],
      certificates: [certificateRow('PMA-2026-AAAA1111')],
    })

    await claim(db)

    expect(db.updates()).toEqual([
      {
        table: 'in_app_notifications',
        kind: 'update',
        columns: 'id',
        payload: { celebrated_at: NOW.toISOString(), is_read: true, read_at: NOW.toISOString() },
        filters: [
          { op: 'eq', column: 'id', value: 'n-cert' },
          { op: 'eq', column: 'user_id', value: USER },
          { op: 'is', column: 'celebrated_at', value: null },
        ],
      },
    ])
  })

  it('returns null when the compare-and-set matches no row and nothing else is claimable', async () => {
    db = createFakeSupabase({
      users: [userRow()],
      in_app_notifications: [notificationRow('n-cert', 'certificate-generated-PMA-2026-AAAA1111')],
      certificates: [certificateRow('PMA-2026-AAAA1111')],
    })
    // Another tab celebrates the row after this call selected it but before it wrote.
    db.hooks.beforeUpdate = () => {
      Object.assign(db.notification('n-cert') as Row, { celebrated_at: 'other-tab' })
    }

    expect(await claim(db)).toBeNull()
    expect(db.updates()).toHaveLength(1)
    expect(db.notification('n-cert')).toMatchObject({ celebrated_at: 'other-tab' })
  })

  it('falls through to the next candidate when another tab wins the first', async () => {
    db = createFakeSupabase({
      users: [userRow()],
      in_app_notifications: [
        notificationRow('n-cert', 'certificate-generated-PMA-2026-AAAA1111'),
        notificationRow('n-cap', `capstone-reviewed-${SUBMISSION}`),
      ],
      certificates: [certificateRow('PMA-2026-AAAA1111')],
      capstone_submissions: [capstoneRow(SUBMISSION)],
    })
    db.hooks.beforeUpdate = (query) => {
      const targetsCertificate = query.filters.some((f) => f.column === 'id' && f.value === 'n-cert')
      if (targetsCertificate) Object.assign(db.notification('n-cert') as Row, { celebrated_at: 'other-tab' })
    }

    expect(await claim(db)).toMatchObject({ kind: 'capstone', notificationId: 'n-cap' })
    expect(db.updates()).toHaveLength(2)
  })

  it('lets exactly one of two concurrent claims win a single candidate', async () => {
    db = createFakeSupabase({
      users: [userRow()],
      in_app_notifications: [notificationRow('n-cert', 'certificate-generated-PMA-2026-AAAA1111')],
      certificates: [certificateRow('PMA-2026-AAAA1111')],
    })

    const results = await Promise.all([claim(db), claim(db)])

    // Both calls saw the row as unread and both attempted the write; the write decided.
    expect(db.updates()).toHaveLength(2)
    expect(results.filter((result) => result !== null)).toHaveLength(1)
    expect(results.find((result) => result !== null)).toMatchObject({ notificationId: 'n-cert' })
  })

  it('defaults the verification origin to the configured site url, without a trailing slash', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://learn.example.test/')
    db = createFakeSupabase({
      users: [userRow()],
      in_app_notifications: [notificationRow('n-cert', 'certificate-generated-PMA-2026-AAAA1111')],
      certificates: [certificateRow('PMA-2026-AAAA1111')],
    })

    const celebration = await claimNextAchievementCelebration(db.client, USER, { now: NOW })
    vi.unstubAllEnvs()

    expect(celebration).toMatchObject({
      certificate: { verificationUrl: 'https://learn.example.test/verify/PMA-2026-AAAA1111' },
    })
  })
})

// ─── Failure handling ────────────────────────────────────────────────────────

describe('claimNextAchievementCelebration — a query error is never a verification', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  const seeded = () =>
    createFakeSupabase({
      users: [userRow()],
      in_app_notifications: [
        notificationRow('n-cert', 'certificate-generated-PMA-2026-AAAA1111'),
        notificationRow('n-cap', `capstone-reviewed-${SUBMISSION}`),
      ],
      certificates: [certificateRow('PMA-2026-AAAA1111')],
      capstone_submissions: [capstoneRow(SUBMISSION)],
    })

  it('returns null without writing when the candidate read fails', async () => {
    db = seeded()
    db.failures.set('in_app_notifications:select', { message: 'gateway timeout', code: '504' })

    expect(await claim(db)).toBeNull()
    expect(db.updates()).toEqual([])
  })

  it('returns null without writing when the caller profile read fails', async () => {
    db = seeded()
    db.failures.set('users:select', { message: 'gateway timeout', code: '504' })

    expect(await claim(db)).toBeNull()
    expect(db.updates()).toEqual([])
  })

  it('returns null without writing when the caller has no profile row', async () => {
    db = seeded()
    db.tables.users.length = 0

    expect(await claim(db)).toBeNull()
    expect(db.updates()).toEqual([])
  })

  it('leaves certificates unclaimed when their verification read fails, and moves on', async () => {
    db = seeded()
    db.failures.set('certificates:select', { message: 'gateway timeout', code: '504' })

    expect(await claim(db)).toMatchObject({ kind: 'capstone', notificationId: 'n-cap' })
    expect(db.notification('n-cert')).toMatchObject({ is_read: false, read_at: null })
  })

  it('returns null when the claiming update itself fails', async () => {
    db = seeded()
    db.failures.set('in_app_notifications:update', { message: 'gateway timeout', code: '504' })

    expect(await claim(db)).toBeNull()
    // One attempt, then stop: the write path is failing, so nothing else is tried.
    expect(db.updates()).toHaveLength(1)
    expect(db.notification('n-cert')).toMatchObject({ is_read: false })
    expect(db.notification('n-cap')).toMatchObject({ is_read: false })
  })

  it('logs no identifiers when a read fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    db = seeded()
    db.failures.set('certificates:select', { message: 'gateway timeout', code: '504' })

    await claim(db)

    expect(warn).toHaveBeenCalled()
    const logged = JSON.stringify(warn.mock.calls)
    for (const secret of [USER, 'ada', 'Ada Lovelace', 'PMA-2026-AAAA1111', SUBMISSION, 'n-cert']) {
      expect(logged).not.toContain(secret)
    }
  })
})

// ─── The route ───────────────────────────────────────────────────────────────

// ─── Modules (Growth R4 / A2) ─────────────────────────────────────────────────

const moduleKey = (slug: string, userId = USER) => `module-completed-${userId}-${slug}`
const progressRows = (slug: string, overrides: Row = {}) =>
  getLessonIdsForModule(slug).map((lessonId) => ({ user_id: USER, lesson_id: lessonId, status: 'completed', ...overrides }))

describe('claimNextAchievementCelebration — modules', () => {
  it('celebrates a module whose lessons are all completed, with its capstone', async () => {
    db = createFakeSupabase({
      users: [userRow()],
      in_app_notifications: [notificationRow('n-mod', moduleKey('discovery'))],
      user_lesson_progress: progressRows('discovery'),
    })

    const celebration = await claim(db)

    expect(celebration).toMatchObject({
      kind: 'module',
      notificationId: 'n-mod',
      module: { slug: 'discovery', title: 'Users, Problems & Discovery' },
      capstone: { slug: 'discovery', submitted: false },
    })
    expect(db.notification('n-mod')).toMatchObject({ is_read: true })
  })

  it.each([
    ['submitted', true],
    ['reviewed', true],
    ['draft', false],
  ])('marks the capstone submitted for a %s submission: %s', async (status, submitted) => {
    db = createFakeSupabase({
      users: [userRow()],
      in_app_notifications: [notificationRow('n-mod', moduleKey('discovery'))],
      user_lesson_progress: progressRows('discovery'),
      capstone_submissions: [capstoneRow(SUBMISSION, { module_slug: 'discovery', status, is_public: false })],
    })

    expect(await claim(db)).toMatchObject({ capstone: { slug: 'discovery', submitted } })
  })

  it('still celebrates when the capstone read fails, without the submitted hint', async () => {
    db = createFakeSupabase({
      users: [userRow()],
      in_app_notifications: [notificationRow('n-mod', moduleKey('discovery'))],
      user_lesson_progress: progressRows('discovery'),
    })
    db.failures.set('capstone_submissions:select', { message: 'boom', code: 'XX000' })
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(await claim(db)).toMatchObject({ kind: 'module', capstone: { submitted: false } })
  })

  it('points the Growth & Metrics module at its metrics capstone', async () => {
    db = createFakeSupabase({
      users: [userRow()],
      in_app_notifications: [notificationRow('n-mod', moduleKey('growth'))],
      user_lesson_progress: progressRows('growth'),
    })

    expect(await claim(db)).toMatchObject({ module: { slug: 'growth' }, capstone: { slug: 'metrics' } })
  })

  it('does not celebrate a module that is no longer complete (reset since the event)', async () => {
    db = createFakeSupabase({
      users: [userRow()],
      in_app_notifications: [notificationRow('n-mod', moduleKey('discovery'))],
      user_lesson_progress: progressRows('discovery').slice(1),
    })

    expect(await claim(db)).toBeNull()
    expect(db.notification('n-mod')).toMatchObject({ is_read: false })
  })

  it.each([
    ['another learner', moduleKey('discovery', OTHER_USER)],
    ['an unknown module', moduleKey('not-a-module')],
    ['a registry alias', moduleKey('tech_ai')],
  ])('ignores a key naming %s', async (_label, key) => {
    db = createFakeSupabase({
      users: [userRow()],
      in_app_notifications: [notificationRow('n-mod', key)],
      user_lesson_progress: [...progressRows('discovery'), ...progressRows('technical')],
    })

    expect(await claim(db)).toBeNull()
    expect(db.notification('n-mod')).toMatchObject({ is_read: false })
  })

  it('celebrates the certificate before a module that completed at the same moment', async () => {
    db = createFakeSupabase({
      users: [userRow()],
      in_app_notifications: [
        notificationRow('n-mod', moduleKey('capstone'), { created_at: ago(2 * HOUR_MS) }),
        notificationRow('n-cert', 'certificate-generated-PMA-2026-AAAA1111'),
      ],
      certificates: [certificateRow('PMA-2026-AAAA1111')],
      user_lesson_progress: progressRows('capstone'),
    })

    expect(await claim(db)).toMatchObject({ kind: 'certificate' })
    expect(await claim(db)).toMatchObject({ kind: 'module', module: { slug: 'capstone' } })
  })
})

describe('POST /api/notifications/celebrations', () => {
  const request = (body?: unknown) =>
    new Request(`https://prodily.app${ACHIEVEMENT_CELEBRATIONS_PATH}`, {
      method: 'POST',
      ...(body === undefined
        ? {}
        : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    })

  const signIn = (userId: string | null) =>
    vi
      .spyOn(authLib, 'getAuthenticatedUserFromRequest')
      .mockResolvedValue(
        (userId ? { id: userId, email: 'ada@example.test' } : null) as unknown as import('@supabase/supabase-js').User
      )

  const useDb = (fake: FakeDb) =>
    vi
      .spyOn(supabaseLib, 'createServiceRoleClient')
      .mockReturnValue(fake.client as unknown as ReturnType<typeof supabaseLib.createServiceRoleClient>)

  const seeded = () =>
    createFakeSupabase({
      users: [userRow()],
      in_app_notifications: [notificationRow('n-cert', 'certificate-generated-PMA-2026-AAAA1111')],
      certificates: [certificateRow('PMA-2026-AAAA1111')],
    })

  it('returns the contract body with the claimed celebration', async () => {
    db = seeded()
    signIn(USER)
    useDb(db)
    vi.spyOn(globalFeatureFlagService, 'isEnabledAsync').mockResolvedValue(true)
    const { POST } = await import('../../app/api/notifications/celebrations/route')

    const response = await POST(request())

    expect(response.status).toBe(200)
    const json = await response.json()
    expect(Object.keys(json).sort()).toEqual(['celebration', 'success'])
    expect(json.success).toBe(true)
    expect(json.celebration).toMatchObject({
      kind: 'certificate',
      notificationId: 'n-cert',
      certificate: { code: 'PMA-2026-AAAA1111' },
    })
    expect(db.notification('n-cert')).toMatchObject({ is_read: true })
  })

  it('returns a null celebration when there is nothing to claim', async () => {
    db = createFakeSupabase({ users: [userRow()] })
    signIn(USER)
    useDb(db)
    vi.spyOn(globalFeatureFlagService, 'isEnabledAsync').mockResolvedValue(true)
    const { POST } = await import('../../app/api/notifications/celebrations/route')

    const response = await POST(request())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, celebration: null })
  })

  it('returns a null celebration and issues no query at all when the kill switch is off', async () => {
    db = seeded()
    signIn(USER)
    const clientFactory = useDb(db)
    const flag = vi.spyOn(globalFeatureFlagService, 'isEnabledAsync').mockResolvedValue(false)
    const { POST } = await import('../../app/api/notifications/celebrations/route')

    const response = await POST(request())

    expect(flag).toHaveBeenCalledWith('ACHIEVEMENT_CELEBRATIONS_ENABLED', true)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, celebration: null })
    expect(clientFactory).not.toHaveBeenCalled()
    expect(db.queries).toEqual([])
    expect(db.notification('n-cert')).toMatchObject({ is_read: false, read_at: null })
  })

  it('claims a completed module with no flag of its own (only the master kill switch)', async () => {
    db = createFakeSupabase({
      users: [userRow()],
      in_app_notifications: [notificationRow('n-mod', moduleKey('discovery'))],
      user_lesson_progress: progressRows('discovery'),
    })
    signIn(USER)
    useDb(db)
    const flag = vi.spyOn(globalFeatureFlagService, 'isEnabledAsync').mockResolvedValue(true)
    const { POST } = await import('../../app/api/notifications/celebrations/route')

    const json = await (await POST(request())).json()

    expect(flag.mock.calls.map(([key]) => key)).toEqual(['ACHIEVEMENT_CELEBRATIONS_ENABLED'])
    expect(json.celebration?.kind).toBe('module')
  })

  it('takes the user from the session and ignores any id in the body', async () => {
    db = createFakeSupabase({
      users: [userRow(), userRow({ id: OTHER_USER, username: 'grace' })],
      in_app_notifications: [
        notificationRow('n-theirs', 'certificate-generated-PMA-2026-AAAA1111', { user_id: OTHER_USER }),
      ],
      certificates: [certificateRow('PMA-2026-AAAA1111', { user_id: OTHER_USER })],
    })
    signIn(USER)
    useDb(db)
    vi.spyOn(globalFeatureFlagService, 'isEnabledAsync').mockResolvedValue(true)
    const { POST } = await import('../../app/api/notifications/celebrations/route')

    const response = await POST(request({ userId: OTHER_USER, user_id: OTHER_USER, notificationId: 'n-theirs' }))

    expect(await response.json()).toEqual({ success: true, celebration: null })
    expect(db.notification('n-theirs')).toMatchObject({ is_read: false })
    for (const query of db.queries) {
      expect(JSON.stringify(query.filters)).not.toContain(OTHER_USER)
    }
  })

  it('refuses an unauthenticated caller before touching the database', async () => {
    db = seeded()
    signIn(null)
    const clientFactory = useDb(db)
    const flag = vi.spyOn(globalFeatureFlagService, 'isEnabledAsync').mockResolvedValue(true)
    const { POST } = await import('../../app/api/notifications/celebrations/route')

    const response = await POST(request())

    expect(response.status).toBe(401)
    expect(flag).not.toHaveBeenCalled()
    expect(clientFactory).not.toHaveBeenCalled()
    expect(db.queries).toEqual([])
  })

  it('is a learner-only withRoute handler that reads nothing from the request', () => {
    const source = readSource('app/api/notifications/celebrations/route.ts')

    expect(source).toContain("actor: { allow: ['learner'] }")
    expect(source).toContain("operation: 'notifications.celebrations.claim'")
    expect(source).toContain('requireUserId(actor)')
    expect(source).not.toMatch(/request\.(json|text|formData|url)|searchParams/)
  })
})

// ─── Wiring that must not drift ──────────────────────────────────────────────

describe('achievement celebration wiring', () => {
  it('uses the same id prefixes the emitters write', () => {
    // The notification row has no event-type column: the idempotency key (the event id) is
    // the only type signal. If an emitter renames its id, this is where it shows up.
    const emitters: Record<keyof typeof ACHIEVEMENT_CELEBRATION_KEY_PREFIXES, string> = {
      certificate: 'lib/certificates/issue-flow.ts',
      capstone: 'lib/admin/moderation-service.ts',
      fellow: 'lib/admin/service.ts',
      module: 'lib/academy/module-completion.ts',
    }

    expect(ACHIEVEMENT_CELEBRATION_KEY_PREFIXES).toEqual({
      certificate: 'certificate-generated-',
      capstone: 'capstone-reviewed-',
      fellow: 'fellow-granted-',
      module: 'module-completed-',
    })
    for (const [kind, file] of Object.entries(emitters)) {
      const prefix = ACHIEVEMENT_CELEBRATION_KEY_PREFIXES[kind as keyof typeof emitters]
      expect(readSource(file), `${file} should build an id from \`${prefix}\${...}\``).toContain(
        '`' + prefix + '${'
      )
    }
  })

  it('does not pull the notification dispatcher into the claim module', () => {
    const source = readSource('lib/notifications/in-app/achievement-celebrations.ts')

    // Imports only — the module's comments name the emitters on purpose.
    expect(source).not.toMatch(
      /(from|import\()\s*['"][^'"]*(certificates\/issue-flow|notifications\/dispatcher|events\/connectors|admin\/)[^'"]*['"]/
    )
  })

  it('has no separate module celebration flag', () => {
    expect(Object.keys(DEFAULT_FEATURE_FLAGS)).not.toContain('MODULE_CELEBRATIONS_ENABLED')
    expect(readSource('lib/notifications/feature-flags/types.ts')).not.toContain('MODULE_CELEBRATIONS_ENABLED')
  })

  it('ships the kill switch enabled by default', () => {
    expect(DEFAULT_FEATURE_FLAGS.ACHIEVEMENT_CELEBRATIONS_ENABLED).toBe(true)
    expect(readSource('lib/notifications/feature-flags/types.ts')).toContain("'ACHIEVEMENT_CELEBRATIONS_ENABLED'")
  })

  it('gives every default flag a category on the admin flags page', () => {
    // An uncategorised key used to crash the page (`FLAG_CATEGORIES[key].icon` on undefined),
    // so a default and its category entry have to land together.
    const section = readSource('components/admin/FeatureFlagsSection.tsx')

    for (const key of Object.keys(DEFAULT_FEATURE_FLAGS)) {
      expect(section, key).toMatch(new RegExp(`^\\s*${key}: \\{`, 'm'))
    }
  })

  it('falls back to a default category instead of dereferencing a missing one', () => {
    const section = readSource('components/admin/FeatureFlagsSection.tsx')

    expect(section).not.toMatch(/flags\[0\] \? FLAG_CATEGORIES\[flags\[0\]\.key\] :/)
    expect(section).toMatch(/FLAG_CATEGORIES\[flags\[0\]\.key\] \?\? FALLBACK_CATEGORY/)
  })
})
