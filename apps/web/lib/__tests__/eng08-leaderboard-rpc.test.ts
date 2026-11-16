/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SystemService } from '@/lib/admin/system-service'
import * as outOfBandModule from '@/lib/monitoring/out-of-band-alert'

describe('ENG-08 & ENG-10 (AG-31): Leaderboard RPC and Database Size Monitoring', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    ;(SystemService as any).lastSizeAlertSentAt = 0
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calculates database size bytes from RPC result and checks 70% threshold', async () => {
    const mockSupabase = {
      rpc: vi.fn().mockResolvedValue({ data: 400 * 1024 * 1024, error: null }),
    } as any

    const alertSpy = vi.spyOn(outOfBandModule, 'deliverOutOfBandAlert').mockResolvedValue({ delivered: true })

    const sizeBytes = await SystemService.getDatabaseSizeBytes(mockSupabase)
    expect(sizeBytes).toBe(400 * 1024 * 1024)
    // 400 MB is > 70% of 500 MB (350 MB), so alert was triggered
    expect(alertSpy).toHaveBeenCalled()
  })

  it('throttles database size alert to at most once per 24 hours', async () => {
    const mockSupabase = {
      rpc: vi.fn().mockResolvedValue({ data: 400 * 1024 * 1024, error: null }),
    } as any

    const alertSpy = vi.spyOn(outOfBandModule, 'deliverOutOfBandAlert').mockResolvedValue({ delivered: true })

    // Call twice in succession
    await SystemService.getDatabaseSizeBytes(mockSupabase)
    await SystemService.getDatabaseSizeBytes(mockSupabase)

    // Should only have been called once due to throttling
    expect(alertSpy).toHaveBeenCalledTimes(1)
  })

  it('returns null gracefully when get_database_size_bytes RPC fails or is missing', async () => {
    const mockSupabase = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'function does not exist' } }),
    } as any

    const sizeBytes = await SystemService.getDatabaseSizeBytes(mockSupabase)
    expect(sizeBytes).toBeNull()
  })
})
