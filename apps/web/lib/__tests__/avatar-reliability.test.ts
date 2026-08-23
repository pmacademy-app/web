/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  AvatarService,
  extractAvatarStoragePath,
  getInitialsFromName,
  MAX_AVATAR_SIZE_BYTES,
} from '@/lib/avatar/avatar-service'
import { POST as avatarPostHandler, DELETE as avatarDeleteHandler } from '../../app/api/user/avatar/route'

function createMockRequest(url: string, options: {
  method?: string
  headers?: Record<string, string>
  body?: string
  formData?: FormData
}) {
  const parsedUrl = new URL(url)
  const headerMap = new Map<string, string>()
  if (options.headers) {
    Object.entries(options.headers).forEach(([k, v]) => headerMap.set(k.toLowerCase(), v))
  }

  return {
    url,
    nextUrl: parsedUrl,
    method: options.method || 'POST',
    headers: {
      get: (headerName: string) => headerMap.get(headerName.toLowerCase()) || null,
    },
    text: async () => options.body || '',
    json: async () => JSON.parse(options.body || '{}'),
    formData: async () => options.formData || new FormData(),
  } as any
}

describe('Phase 7 — Avatar Upload Reliability, Storage Consistency & Cleanup', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('1. Path Extraction & Name Initials', () => {
    it('extracts storage paths correctly from public Supabase URLs and relative paths', () => {
      const fullUrl = 'https://mock.supabase.co/storage/v1/object/public/avatars/usr-123/avatar-1700000000.jpg'
      expect(extractAvatarStoragePath(fullUrl)).toBe('usr-123/avatar-1700000000.jpg')

      const relativePath = 'usr-123/avatar-1700000000.jpg'
      expect(extractAvatarStoragePath(relativePath)).toBe('usr-123/avatar-1700000000.jpg')

      expect(extractAvatarStoragePath('')).toBeNull()
      expect(extractAvatarStoragePath(null)).toBeNull()
    })

    it('generates 2-letter uppercase initials from full names and handles edge cases', () => {
      expect(getInitialsFromName('Alex Morgan')).toBe('AM')
      expect(getInitialsFromName('Alice')).toBe('A')
      expect(getInitialsFromName('John Robert Doe')).toBe('JR')
      expect(getInitialsFromName('')).toBe('?')
      expect(getInitialsFromName(null)).toBe('?')
    })

    it('resolves avatar metadata cleanly', () => {
      const resolvedWithAvatar = AvatarService.resolveAvatar('https://example.com/pic.jpg', 'Taylor Swift')
      expect(resolvedWithAvatar.hasCustomAvatar).toBe(true)
      expect(resolvedWithAvatar.url).toBe('https://example.com/pic.jpg')
      expect(resolvedWithAvatar.initials).toBe('TS')

      const resolvedWithoutAvatar = AvatarService.resolveAvatar(null, 'Taylor Swift')
      expect(resolvedWithoutAvatar.hasCustomAvatar).toBe(false)
      expect(resolvedWithoutAvatar.url).toBeNull()
      expect(resolvedWithoutAvatar.initials).toBe('TS')
    })
  })

  describe('2. Validation Rules', () => {
    it('rejects unsupported MIME types (SVG, PDF, text)', async () => {
      const dummyBuffer = Buffer.from('fake image content')

      await expect(
        AvatarService.uploadAndSetUserAvatar({
          userId: 'usr-1',
          fileBuffer: dummyBuffer,
          mimeType: 'image/svg+xml',
        })
      ).rejects.toThrow('Unsupported image format')

      await expect(
        AvatarService.uploadAndSetUserAvatar({
          userId: 'usr-1',
          fileBuffer: dummyBuffer,
          mimeType: 'application/pdf',
        })
      ).rejects.toThrow('Unsupported image format')
    })

    it('rejects oversized files exceeding 2MB', async () => {
      const oversizedBuffer = Buffer.alloc(MAX_AVATAR_SIZE_BYTES + 1024)

      await expect(
        AvatarService.uploadAndSetUserAvatar({
          userId: 'usr-1',
          fileBuffer: oversizedBuffer,
          mimeType: 'image/jpeg',
        })
      ).rejects.toThrow('Image file size exceeds maximum limit of 2MB')
    })
  })

  describe('3. Transactional Upload & Safe Replacement Ordering', () => {
    it('successfully uploads new avatar and returns public URL', async () => {
      const dummyBuffer = Buffer.from('valid png data')
      const result = await AvatarService.uploadAndSetUserAvatar({
        userId: 'usr-valid-1',
        fileBuffer: dummyBuffer,
        mimeType: 'image/png',
      })

      expect(result.success).toBe(true)
      expect(result.avatarUrl).toContain('avatars/usr-valid-1/avatar-')
      expect(result.storagePath).toContain('usr-valid-1/avatar-')
    })

    it('rolls back uploaded storage object if database update fails', async () => {
      const mockStorage = {
        upload: vi.fn().mockResolvedValue({ error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://mock.supabase.co/storage/v1/object/public/avatars/usr-fail-db/avatar-1.jpg' } }),
        remove: vi.fn().mockResolvedValue({ data: [], error: null }),
      }

      const mockClient = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { avatar_url: null } }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: { message: 'DB connection dropped' } }),
          }),
        }),
        storage: {
          from: vi.fn().mockReturnValue(mockStorage),
        },
      }

      const dummyBuffer = Buffer.from('test data')
      await expect(
        AvatarService.uploadAndSetUserAvatar({
          userId: 'usr-fail-db',
          fileBuffer: dummyBuffer,
          mimeType: 'image/jpeg',
          supabaseClient: mockClient,
        })
      ).rejects.toThrow('Failed to save avatar reference to profile')

      // Verifies storage object was cleaned up on DB failure
      expect(mockStorage.remove).toHaveBeenCalled()
    })

    it('cleans up old avatar object after successful replacement', async () => {
      const oldUrl = 'https://mock.supabase.co/storage/v1/object/public/avatars/usr-replace/avatar-1111111111.jpg'

      const mockStorage = {
        upload: vi.fn().mockResolvedValue({ error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://mock.supabase.co/storage/v1/object/public/avatars/usr-replace/avatar-2222222222.jpg' } }),
        remove: vi.fn().mockResolvedValue({ data: [], error: null }),
      }

      const mockClient = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { avatar_url: oldUrl } }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
        storage: {
          from: vi.fn().mockReturnValue(mockStorage),
        },
      }

      const dummyBuffer = Buffer.from('replacement data')
      const result = await AvatarService.uploadAndSetUserAvatar({
        userId: 'usr-replace',
        fileBuffer: dummyBuffer,
        mimeType: 'image/webp',
        supabaseClient: mockClient,
      })

      expect(result.success).toBe(true)
      expect(mockStorage.remove).toHaveBeenCalledWith(['usr-replace/avatar-1111111111.jpg'])
    })
  })

  describe('4. Avatar Removal', () => {
    it('clears database avatar reference and deletes storage object', async () => {
      const oldUrl = 'https://mock.supabase.co/storage/v1/object/public/avatars/usr-remove/avatar-999.jpg'

      const mockStorage = {
        remove: vi.fn().mockResolvedValue({ data: [], error: null }),
      }

      const mockClient = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { avatar_url: oldUrl } }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
        storage: {
          from: vi.fn().mockReturnValue(mockStorage),
        },
      }

      const result = await AvatarService.removeUserAvatar('usr-remove', mockClient)
      expect(result.success).toBe(true)
      expect(mockStorage.remove).toHaveBeenCalledWith(['usr-remove/avatar-999.jpg'])
    })
  })

  describe('5. Orphaned Storage Object Reconciliation', () => {
    it('identifies unreferenced storage objects in dry-run mode without deleting', async () => {
      const mockStorage = {
        list: vi.fn().mockImplementation(async (folder: string) => {
          if (folder === '') {
            return { data: [{ name: 'usr-active' }, { name: 'usr-orphan' }], error: null }
          }
          if (folder === 'usr-active') {
            return {
              data: [
                { name: 'avatar-1.jpg', created_at: new Date(Date.now() - 48 * 3600 * 1000).toISOString() },
                { name: 'avatar-old-orphan.jpg', created_at: new Date(Date.now() - 48 * 3600 * 1000).toISOString() },
              ],
              error: null,
            }
          }
          if (folder === 'usr-orphan') {
            return {
              data: [{ name: 'avatar-ghost.jpg', created_at: new Date(Date.now() - 48 * 3600 * 1000).toISOString() }],
              error: null,
            }
          }
          return { data: [], error: null }
        }),
        remove: vi.fn().mockResolvedValue({ data: [], error: null }),
      }

      const mockClient = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          not: vi.fn().mockResolvedValue({
            data: [{ avatar_url: 'https://mock.supabase.co/storage/v1/object/public/avatars/usr-active/avatar-1.jpg' }],
            error: null,
          }),
        }),
        storage: {
          from: vi.fn().mockReturnValue(mockStorage),
        },
      }

      const result = await AvatarService.cleanupOrphanedAvatars({
        dryRun: true,
        minAgeHours: 24,
        supabaseClient: mockClient,
      })
      expect(result.dryRun).toBe(true)
      expect(result.orphansFound).toBe(2) // avatar-old-orphan.jpg and avatar-ghost.jpg
      expect(result.orphansDeleted).toBe(0)
    })
  })

  describe('6. User Avatar API Endpoints (/api/user/avatar)', () => {
    it('returns HTTP 401 for unauthenticated requests', async () => {
      const req = createMockRequest('http://localhost:3000/api/user/avatar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ base64: 'data' }),
      })

      const res = await avatarPostHandler(req)
      expect(res.status).toBe(401)

      const delReq = createMockRequest('http://localhost:3000/api/user/avatar', {
        method: 'DELETE',
      })
      const delRes = await avatarDeleteHandler(delReq)
      expect(delRes.status).toBe(401)
    })
  })
})
