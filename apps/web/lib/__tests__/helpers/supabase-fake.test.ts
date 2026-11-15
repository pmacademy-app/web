import { describe, it, expect, beforeEach } from 'vitest'
import { SupabaseFake } from './supabase-fake'

describe('SupabaseFake: in-memory query builder and table store', () => {
  let fake: SupabaseFake

  beforeEach(() => {
    fake = new SupabaseFake()
  })

  it('handles basic select, eq, neq, in filtering', async () => {
    fake.seed('users', [
      { id: 'u1', name: 'Alice', role: 'admin', active: true },
      { id: 'u2', name: 'Bob', role: 'learner', active: true },
      { id: 'u3', name: 'Charlie', role: 'learner', active: false },
    ])

    const { data: admins } = await fake.from('users').select('*').eq('role', 'admin')
    expect(admins).toHaveLength(1)
    expect((admins as Array<{ name: string }>)[0].name).toBe('Alice')

    const { data: nonAdmins } = await fake.from('users').select('*').neq('role', 'admin')
    expect(nonAdmins).toHaveLength(2)

    const { data: named } = await fake.from('users').select('*').in('name', ['Alice', 'Charlie'])
    expect(named).toHaveLength(2)
  })

  it('handles gte, lte, gt, lt range filtering and ordering', async () => {
    fake.seed('xp_events', [
      { id: 'e1', amount: 10 },
      { id: 'e2', amount: 50 },
      { id: 'e3', amount: 100 },
    ])

    const { data: medium } = await fake.from('xp_events').select('*').gte('amount', 50).lte('amount', 100)
    expect(medium).toHaveLength(2)

    const { data: orderedDesc } = await fake.from('xp_events').select('*').order('amount', { ascending: false })
    expect((orderedDesc as Array<{ amount: number }>)[0].amount).toBe(100)
  })

  it('handles null checks with is and not', async () => {
    fake.seed('users', [
      { id: 'u1', goal: 'career_pivot' },
      { id: 'u2', goal: null },
    ])

    const { data: withGoal } = await fake.from('users').select('*').not('goal', 'is', null)
    expect(withGoal).toHaveLength(1)
    expect((withGoal as Array<{ id: string }>)[0].id).toBe('u1')

    const { data: withoutGoal } = await fake.from('users').select('*').is('goal', null)
    expect(withoutGoal).toHaveLength(1)
    expect((withoutGoal as Array<{ id: string }>)[0].id).toBe('u2')
  })

  it('handles count options exact and head', async () => {
    fake.seed('users', [
      { id: 'u1', status: 'new' },
      { id: 'u2', status: 'new' },
      { id: 'u3', status: 'active' },
    ])

    const resHead = await fake.from('users').select('id', { count: 'exact', head: true }).eq('status', 'new')
    expect(resHead.data).toBeNull()
    expect(resHead.count).toBe(2)

    const resWithData = await fake.from('users').select('*', { count: 'exact' }).eq('status', 'new')
    expect(resWithData.data).toHaveLength(2)
    expect(resWithData.count).toBe(2)
  })

  it('handles single and maybeSingle conventions', async () => {
    fake.seed('items', [{ id: 'i1', name: 'Item 1' }])

    const singleFound = await fake.from('items').select('*').eq('id', 'i1').single()
    expect(singleFound.error).toBeNull()
    expect((singleFound.data as { name: string }).name).toBe('Item 1')

    const singleNotFound = await fake.from('items').select('*').eq('id', 'nonexistent').single()
    expect(singleNotFound.error).not.toBeNull()
    expect(singleNotFound.data).toBeNull()

    const maybeNotFound = await fake.from('items').select('*').eq('id', 'nonexistent').maybeSingle()
    expect(maybeNotFound.error).toBeNull()
    expect(maybeNotFound.data).toBeNull()
  })

  it('handles mutations insert, update, upsert, and delete', async () => {
    // Insert
    const inserted = await fake.from('logs').insert({ message: 'log-1' })
    expect(inserted.error).toBeNull()
    expect(fake.getTableRows('logs')).toHaveLength(1)

    // Update
    await fake.from('logs').update({ message: 'updated-log' }).eq('message', 'log-1')
    expect(fake.getTableRows('logs')[0].message).toBe('updated-log')

    // Upsert
    await fake.from('logs').upsert({ id: 'custom_id', message: 'upserted' })
    expect(fake.getTableRows('logs')).toHaveLength(2)

    // Delete
    await fake.from('logs').delete().eq('id', 'custom_id')
    expect(fake.getTableRows('logs')).toHaveLength(1)
  })

  it('allows forcing errors per table and per rpc', async () => {
    fake.forceError('sensitive_table', new Error('Database connection failed'))
    const { data, error } = await fake.from('sensitive_table').select('*')
    expect(data).toBeNull()
    expect(error?.message).toBe('Database connection failed')

    fake.forceRpcError('custom_rpc', Object.assign(new Error('RPC failed'), { code: 'P0001' }))
    const rpcRes = await fake.rpc('custom_rpc')
    expect(rpcRes.error?.code).toBe('P0001')
  })
})
