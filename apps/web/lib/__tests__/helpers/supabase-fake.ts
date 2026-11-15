/**
 * Shared in-memory Supabase test fake (CQ-32 / AG-06).
 *
 * Provides a faithful, chainable in-memory implementation of PostgREST query builders
 * and Supabase auth/RPC methods for deterministic unit tests without network calls
 * or fragile hand-rolled chaining mocks.
 */

export type TableRow = Record<string, unknown>

interface FilterPredicate {
  (row: TableRow): boolean
}

export class FakeRpcBuilder<T = unknown> implements PromiseLike<{ data: T | null; error: { message: string; code: string } | null }> {
  private fake: SupabaseFake
  private fnName: string
  private args?: Record<string, unknown>
  private orderColumn?: string
  private orderAscending: boolean = true
  private rangeFrom?: number
  private rangeTo?: number
  private singleMode?: 'single' | 'maybeSingle'

  constructor(fake: SupabaseFake, fnName: string, args?: Record<string, unknown>) {
    this.fake = fake
    this.fnName = fnName
    this.args = args
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this.orderColumn = column
    this.orderAscending = options?.ascending !== false
    return this
  }

  range(from: number, to: number): this {
    this.rangeFrom = from
    this.rangeTo = to
    return this
  }

  single(): this {
    this.singleMode = 'single'
    return this
  }

  maybeSingle(): this {
    this.singleMode = 'maybeSingle'
    return this
  }

  select(_columns: string = '*'): this {
    void _columns
    return this
  }

  eq(_column: string, _value: unknown): this {
    void _column
    void _value
    return this
  }

  then<TResult1 = { data: T | null; error: { message: string; code: string } | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: T | null; error: { message: string; code: string } | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  private async execute(): Promise<{ data: T | null; error: { message: string; code: string } | null }> {
    const rawResult = await this.fake.executeRpc(this.fnName, this.args)
    if (rawResult.error) {
      return rawResult as { data: T | null; error: { message: string; code: string } | null }
    }
    const data = rawResult.data
    if (Array.isArray(data)) {
      let items = [...data]
      if (this.orderColumn) {
        const col = this.orderColumn
        const asc = this.orderAscending
        items.sort((a, b) => {
          const valA = (a as TableRow)?.[col]
          const valB = (b as TableRow)?.[col]
          if (valA === valB) return 0
          if (valA === null || valA === undefined) return 1
          if (valB === null || valB === undefined) return -1
          if ((valA as number | string) < (valB as number | string)) return asc ? -1 : 1
          return asc ? 1 : -1
        })
      }
      if (this.rangeFrom !== undefined && this.rangeTo !== undefined) {
        items = items.slice(this.rangeFrom, this.rangeTo + 1)
      }
      if (this.singleMode === 'single') {
        if (items.length === 0) {
          return { data: null, error: { message: 'Row not found', code: 'PGRST116' } }
        }
        return { data: items[0] as T, error: null }
      }
      if (this.singleMode === 'maybeSingle') {
        return { data: (items[0] ?? null) as T, error: null }
      }
      return { data: items as unknown as T, error: null }
    }
    return { data: data as T, error: null }
  }
}

export class FakeQueryBuilder implements PromiseLike<{ data: unknown; error: Error | null; count?: number | null }> {
  private fake: SupabaseFake
  private tableName: string
  private filters: FilterPredicate[] = []
  private selectedColumns: string = '*'
  private countMode?: 'exact' | 'planned' | 'estimated'
  private headOnly: boolean = false
  private orderColumn?: string
  private orderAscending: boolean = true
  private rangeFrom?: number
  private rangeTo?: number
  private limitCount?: number
  private singleMode?: 'single' | 'maybeSingle'
  private isInsert: boolean = false
  private isUpdate: boolean = false
  private isDelete: boolean = false
  private isUpsert: boolean = false
  private mutationValues?: TableRow | TableRow[]
  private onConflictKey?: string

  constructor(fake: SupabaseFake, tableName: string) {
    this.fake = fake
    this.tableName = tableName
  }

  select(columns: string = '*', options?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }): this {
    this.selectedColumns = columns
    if (options?.count) this.countMode = options.count
    if (options?.head !== undefined) this.headOnly = options.head
    return this
  }

  eq(column: string, value: unknown): this {
    this.filters.push((row) => {
      const val = this.resolveColumnValue(row, column)
      if (val instanceof Date && typeof value === 'string') {
        return val.toISOString() === value
      }
      return val === value
    })
    return this
  }

  neq(column: string, value: unknown): this {
    this.filters.push((row) => {
      const val = this.resolveColumnValue(row, column)
      return val !== value
    })
    return this
  }

  in(column: string, values: unknown[]): this {
    const set = new Set(values)
    this.filters.push((row) => {
      const val = this.resolveColumnValue(row, column)
      return set.has(val)
    })
    return this
  }

  gte(column: string, value: unknown): this {
    this.filters.push((row) => {
      const val = this.resolveColumnValue(row, column)
      if (val === null || val === undefined) return false
      return (val as number | string) >= (value as number | string)
    })
    return this
  }

  lte(column: string, value: unknown): this {
    this.filters.push((row) => {
      const val = this.resolveColumnValue(row, column)
      if (val === null || val === undefined) return false
      return (val as number | string) <= (value as number | string)
    })
    return this
  }

  gt(column: string, value: unknown): this {
    this.filters.push((row) => {
      const val = this.resolveColumnValue(row, column)
      if (val === null || val === undefined) return false
      return (val as number | string) > (value as number | string)
    })
    return this
  }

  lt(column: string, value: unknown): this {
    this.filters.push((row) => {
      const val = this.resolveColumnValue(row, column)
      if (val === null || val === undefined) return false
      return (val as number | string) < (value as number | string)
    })
    return this
  }

  is(column: string, value: unknown): this {
    this.filters.push((row) => {
      const val = this.resolveColumnValue(row, column)
      if (value === null) return val === null || val === undefined
      return val === value
    })
    return this
  }

  not(column: string, operator: string, value: unknown): this {
    if (operator === 'is') {
      this.filters.push((row) => {
        const val = this.resolveColumnValue(row, column)
        if (value === null) return val !== null && val !== undefined
        return val !== value
      })
    } else if (operator === 'in') {
      const set = Array.isArray(value) ? new Set(value) : new Set(String(value).replace(/[()]/g, '').split(','))
      this.filters.push((row) => {
        const val = this.resolveColumnValue(row, column)
        return !set.has(val)
      })
    } else if (operator === 'like' || operator === 'ilike') {
      const regex = new RegExp(`^${String(value).replace(/%/g, '.*')}$`, operator === 'ilike' ? 'i' : '')
      this.filters.push((row) => {
        const val = this.resolveColumnValue(row, column)
        return !regex.test(String(val ?? ''))
      })
    } else {
      this.filters.push((row) => {
        const val = this.resolveColumnValue(row, column)
        return val !== value
      })
    }
    return this
  }

  like(column: string, pattern: string): this {
    const regex = new RegExp(`^${pattern.replace(/%/g, '.*')}$`)
    this.filters.push((row) => {
      const val = this.resolveColumnValue(row, column)
      return regex.test(String(val ?? ''))
    })
    return this
  }

  ilike(column: string, pattern: string): this {
    const regex = new RegExp(`^${pattern.replace(/%/g, '.*')}$`, 'i')
    this.filters.push((row) => {
      const val = this.resolveColumnValue(row, column)
      return regex.test(String(val ?? ''))
    })
    return this
  }

  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): this {
    this.orderColumn = column
    this.orderAscending = options?.ascending !== false
    return this
  }

  range(from: number, to: number): this {
    this.rangeFrom = from
    this.rangeTo = to
    return this
  }

  limit(count: number): this {
    this.limitCount = count
    return this
  }

  single(): this {
    this.singleMode = 'single'
    return this
  }

  maybeSingle(): this {
    this.singleMode = 'maybeSingle'
    return this
  }

  insert(values: TableRow | TableRow[]): this {
    this.isInsert = true
    this.mutationValues = values
    return this
  }

  update(values: TableRow): this {
    this.isUpdate = true
    this.mutationValues = values
    return this
  }

  upsert(values: TableRow | TableRow[], options?: { onConflict?: string }): this {
    this.isUpsert = true
    this.mutationValues = values
    this.onConflictKey = options?.onConflict || 'id'
    return this
  }

  delete(): this {
    this.isDelete = true
    return this
  }

  private resolveColumnValue(row: TableRow, column: string): unknown {
    if (column.includes('.')) {
      const parts = column.split('.')
      let curr: unknown = row
      for (const part of parts) {
        if (curr && typeof curr === 'object') {
          curr = (curr as Record<string, unknown>)[part]
        } else {
          return undefined
        }
      }
      return curr
    }
    return row[column]
  }

  async execute(): Promise<{ data: unknown; error: Error | null; count?: number | null }> {
    const forcedError = this.fake.getForcedError(this.tableName)
    if (forcedError) {
      return { data: null, error: forcedError, count: null }
    }

    const tableRows = this.fake.getTableRows(this.tableName)

    // Handle mutations
    if (this.isInsert && this.mutationValues) {
      const rowsToInsert = Array.isArray(this.mutationValues) ? this.mutationValues : [this.mutationValues]
      const inserted = rowsToInsert.map((r) => ({
        id: r.id || `id_${Math.random().toString(36).slice(2, 10)}`,
        created_at: r.created_at || new Date().toISOString(),
        ...r,
      }))
      tableRows.push(...inserted)
      return { data: Array.isArray(this.mutationValues) ? inserted : inserted[0], error: null }
    }

    if (this.isUpdate && this.mutationValues) {
      const patch = this.mutationValues as TableRow
      const updated: TableRow[] = []
      for (let i = 0; i < tableRows.length; i++) {
        const row = tableRows[i]
        if (this.matchesFilters(row)) {
          const updatedRow = { ...row, ...patch, updated_at: new Date().toISOString() }
          tableRows[i] = updatedRow
          updated.push(updatedRow)
        }
      }
      return { data: updated, error: null }
    }

    if (this.isUpsert && this.mutationValues) {
      const rowsToUpsert = Array.isArray(this.mutationValues) ? this.mutationValues : [this.mutationValues]
      const key = this.onConflictKey || 'id'
      const upserted: TableRow[] = []
      for (const row of rowsToUpsert) {
        const existingIdx = tableRows.findIndex((r) => r[key] === row[key])
        if (existingIdx >= 0) {
          const updatedRow = { ...tableRows[existingIdx], ...row, updated_at: new Date().toISOString() }
          tableRows[existingIdx] = updatedRow
          upserted.push(updatedRow)
        } else {
          const newRow = {
            id: row.id || `id_${Math.random().toString(36).slice(2, 10)}`,
            created_at: row.created_at || new Date().toISOString(),
            ...row,
          }
          tableRows.push(newRow)
          upserted.push(newRow)
        }
      }
      return { data: Array.isArray(this.mutationValues) ? upserted : upserted[0], error: null }
    }

    if (this.isDelete) {
      const remaining: TableRow[] = []
      const deleted: TableRow[] = []
      for (const row of tableRows) {
        if (this.matchesFilters(row)) {
          deleted.push(row)
        } else {
          remaining.push(row)
        }
      }
      this.fake.setTableRows(this.tableName, remaining)
      return { data: deleted, error: null }
    }

    // Query path: filter
    let results = tableRows.filter((r) => this.matchesFilters(r))
    const totalCount = results.length

    // Sort
    if (this.orderColumn) {
      const col = this.orderColumn
      const asc = this.orderAscending
      results.sort((a, b) => {
        const valA = a[col] as string | number | undefined
        const valB = b[col] as string | number | undefined
        if (valA === valB) return 0
        if (valA === undefined || valA === null) return 1
        if (valB === undefined || valB === null) return -1
        if (valA < valB) return asc ? -1 : 1
        return asc ? 1 : -1
      })
    }

    // Pagination
    if (this.rangeFrom !== undefined && this.rangeTo !== undefined) {
      results = results.slice(this.rangeFrom, this.rangeTo + 1)
    } else if (this.limitCount !== undefined) {
      results = results.slice(0, this.limitCount)
    }

    // Single/MaybeSingle handling
    if (this.singleMode === 'single') {
      if (results.length === 0) {
        return { data: null, error: Object.assign(new Error('Row not found'), { code: 'PGRST116' }), count: null }
      }
      if (results.length > 1) {
        return { data: null, error: Object.assign(new Error('Multiple rows returned'), { code: 'PGRST116' }), count: null }
      }
      return { data: results[0], error: null, count: this.countMode ? totalCount : null }
    }

    if (this.singleMode === 'maybeSingle') {
      if (results.length === 0) {
        return { data: null, error: null, count: this.countMode ? totalCount : null }
      }
      if (results.length > 1) {
        return { data: null, error: Object.assign(new Error('Multiple rows returned'), { code: 'PGRST116' }), count: null }
      }
      return { data: results[0], error: null, count: this.countMode ? totalCount : null }
    }

    if (this.headOnly) {
      return { data: null, error: null, count: totalCount }
    }

    return {
      data: results,
      error: null,
      count: this.countMode ? totalCount : null,
    }
  }

  private matchesFilters(row: TableRow): boolean {
    return this.filters.every((fn) => fn(row))
  }

  then<TResult1 = { data: unknown; error: Error | null; count?: number | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: Error | null; count?: number | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null
  ): Promise<{ data: unknown; error: Error | null; count?: number | null } | TResult> {
    return this.execute().catch(onrejected)
  }
}

export class SupabaseFake {
  private tables = new Map<string, TableRow[]>()
  private tableErrors = new Map<string, Error>()
  private rpcHandlers = new Map<string, (args?: Record<string, unknown>) => unknown>()
  private rpcErrors = new Map<string, Error>()

  auth = {
    admin: {
      listUsers: async (_params?: { page?: number; perPage?: number }) => {
        void _params
        const users = this.getTableRows('users')
        return {
          data: {
            users: users.map((u) => ({
              id: (u.id as string) || 'u1',
              email: (u.email as string) || 'test@example.com',
              email_confirmed_at: (u.email_confirmed_at as string) || new Date().toISOString(),
              app_metadata: (u.app_metadata as Record<string, unknown>) || {},
              user_metadata: (u.user_metadata as Record<string, unknown>) || {},
            })),
          },
          error: null,
        }
      },
      deleteUser: async (_userId: string) => {
        void _userId
        return { data: null, error: null }
      },
      updateUserById: async (userId: string, attrs: Record<string, unknown>) => {
        const users = this.getTableRows('users')
        const idx = users.findIndex((u) => u.id === userId)
        if (idx !== -1) {
          users[idx] = { ...users[idx], ...attrs }
          return { data: { user: users[idx] }, error: null }
        }
        return { data: null, error: new Error('User not found') }
      },
      signOut: async (_jwt: string) => {
        void _jwt
        return { data: null, error: null }
      },
      getUserById: async (userId: string) => {
        const user = this.getTableRows('users').find((u) => u.id === userId)
        return { data: user ? { user } : null, error: user ? null : new Error('User not found') }
      },
    },
    getUser: async (_token?: string) => {
      void _token
      const user = this.getTableRows('users')[0] || { id: 'usr_mock_1', email: 'test@example.com' }
      return { data: { user }, error: null }
    },
    getClaims: async (_token?: string) => {
      void _token
      const user = this.getTableRows('users')[0] || { id: 'usr_mock_1', email: 'test@example.com' }
      return {
        data: {
          claims: {
            sub: user.id,
            email: user.email,
            role: 'authenticated',
            app_metadata: (user.app_metadata as Record<string, unknown>) || {},
            user_metadata: (user.user_metadata as Record<string, unknown>) || {},
          },
        },
        error: null,
      }
    },
    refreshSession: async (_params?: { refresh_token: string }) => {
      void _params
      const user = this.getTableRows('users')[0] || { id: 'usr_mock_1', email: 'test@example.com' }
      return {
        data: {
          session: {
            access_token: 'new-access-token',
            refresh_token: 'new-refresh-token',
          },
          user,
        },
        error: null,
      }
    },
    signInWithPassword: async (credentials?: { email?: string; password?: string }) => {
      const user = this.getTableRows('users').find((u) => u.email === credentials?.email) || {
        id: 'usr_mock_1',
        email: credentials?.email || 'test@example.com',
      }
      return {
        data: {
          user,
          session: { access_token: 'tok_123', refresh_token: 'ref_123' },
        },
        error: null,
      }
    },
  }

  from(tableName: string): FakeQueryBuilder {
    return new FakeQueryBuilder(this, tableName)
  }

  rpc(fnName: string, args?: Record<string, unknown>): FakeRpcBuilder {
    return new FakeRpcBuilder(this, fnName, args)
  }

  async executeRpc(
    fnName: string,
    args?: Record<string, unknown>
  ): Promise<{ data: unknown; error: { message: string; code: string } | null }> {
    const forcedErr = this.rpcErrors.get(fnName)
    if (forcedErr) {
      return { data: null, error: { message: forcedErr.message, code: (forcedErr as unknown as { code?: string }).code || 'P0001' } }
    }
    const handler = this.rpcHandlers.get(fnName)
    if (handler) {
      try {
        const result = await handler(args)
        return { data: result, error: null }
      } catch (err) {
        return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: 'P0001' } }
      }
    }
    // Default mock handler for admin_active_users
    if (fnName === 'admin_active_users') {
      const users = this.getTableRows('users')
      return {
        data: users.map((u) => ({
          user_id: u.id as string,
          active_before: false,
        })),
        error: null,
      }
    }
    // Default mock handler for admin_funnel_distinct_users
    if (fnName === 'admin_funnel_distinct_users') {
      const users = this.getTableRows('users')
      const count = users.length
      return {
        data: {
          first_lesson: Math.min(count, 5),
          first_quiz: Math.min(count, 4),
          module_completion: Math.min(count, 2),
        },
        error: null,
      }
    }
    // Default mock handler for admin_user_stats
    if (fnName === 'admin_user_stats') {
      const users = this.getTableRows('users')
      return {
        data: {
          total: users.length,
          public_portfolios: users.filter((u) => Boolean(u.is_portfolio_public)).length,
          levels: { '1': users.length, '2': 0, '3': 0, '4': 0, '5': 0 },
          streaks: [users.length, 0, 0, 0, 0, 0],
        },
        error: null,
      }
    }
    // Default mock handler for admin_capstone_stats
    if (fnName === 'admin_capstone_stats') {
      const subs = this.getTableRows('capstone_submissions')
      return {
        data: {
          submitted: subs.length,
          reviewed: 0,
          submitted_at: subs.map((s) => s.submitted_at || new Date().toISOString()),
        },
        error: null,
      }
    }
    // Default mock handler for admin_flashcard_stats
    if (fnName === 'admin_flashcard_stats') {
      return {
        data: {
          total: 0,
          distinct_users: 0,
        },
        error: null,
      }
    }
    // Default mock handler for admin_lesson_completion_stats
    if (fnName === 'admin_lesson_completion_stats') {
      return {
        data: {
          distinct_users: 0,
          completion_histogram: [],
          modules: [],
        },
        error: null,
      }
    }
    // Default mock handler for record_lesson_quiz_completion
    if (fnName === 'record_lesson_quiz_completion') {
      return {
        data: {
          success: true,
          total_xp_awarded: 25,
          is_first_attempt: true,
        },
        error: null,
      }
    }
    return { data: null, error: { message: `function ${fnName} not found`, code: 'PGRST202' } }
  }

  seed(tableName: string, rows: TableRow[]): this {
    this.tables.set(tableName, [...rows])
    return this
  }

  getTableRows(tableName: string): TableRow[] {
    let rows = this.tables.get(tableName)
    if (!rows) {
      rows = []
      this.tables.set(tableName, rows)
    }
    return rows
  }

  setTableRows(tableName: string, rows: TableRow[]): void {
    this.tables.set(tableName, rows)
  }

  forceError(tableName: string, error: Error): this {
    this.tableErrors.set(tableName, error)
    return this
  }

  clearError(tableName: string): this {
    this.tableErrors.delete(tableName)
    return this
  }

  getForcedError(tableName: string): Error | undefined {
    return this.tableErrors.get(tableName)
  }

  setRpcHandler(fnName: string, handler: (args?: Record<string, unknown>) => unknown): this {
    this.rpcHandlers.set(fnName, handler)
    return this
  }

  forceRpcError(fnName: string, error: Error & { code?: string }): this {
    this.rpcErrors.set(fnName, error)
    return this
  }

  clearAll(): void {
    this.tables.clear()
    this.tableErrors.clear()
    this.rpcHandlers.clear()
    this.rpcErrors.clear()
  }
}
