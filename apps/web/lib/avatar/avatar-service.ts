/**
 * Avatar Management & Storage Consistency Service (Phase 7).
 *
 * Provides transactional avatar uploads, safe replacement ordering,
 * automatic old-object cleanup, and orphaned storage object reconciliation.
 */

import { createServiceRoleClient } from '@/lib/supabase'

export const AVATAR_BUCKET = 'avatars'
export const MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024 // 2MB

export const ALLOWED_AVATAR_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/jpg',
])

export const MIME_TO_EXT_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export interface UploadAvatarParams {
  userId: string
  fileBuffer: Uint8Array | Buffer
  mimeType: string
  fileName?: string
  supabaseClient?: unknown
}

export interface UploadAvatarResult {
  success: boolean
  avatarUrl: string
  storagePath: string
}

export interface ResolvedAvatar {
  url: string | null
  initials: string
  hasCustomAvatar: boolean
}

export interface StorageCleanupResult {
  totalScanned: number
  orphansFound: number
  orphansDeleted: number
  dryRun: boolean
  details: string[]
}

/**
 * Extracts storage object path from a Supabase public storage URL.
 * e.g. "https://.../storage/v1/object/public/avatars/usr-123/avatar-1700000000.jpg" -> "usr-123/avatar-1700000000.jpg"
 */
export function extractAvatarStoragePath(urlOrPath: string | null | undefined): string | null {
  if (!urlOrPath) return null
  const cleaned = urlOrPath.trim()
  if (!cleaned) return null

  // If already relative path
  if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
    return cleaned.replace(/^\/+/, '')
  }

  try {
    const parsed = new URL(cleaned)
    const pathname = decodeURIComponent(parsed.pathname)
    const marker = `/${AVATAR_BUCKET}/`
    const idx = pathname.indexOf(marker)
    if (idx !== -1) {
      return pathname.slice(idx + marker.length).replace(/^\/+/, '')
    }
  } catch {
    // URL parse failure
  }
  return null
}

/**
 * Generates initials fallback from a user display name.
 */
export function getInitialsFromName(name?: string | null): string {
  if (!name || !name.trim()) return '?'
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?'
}

export class AvatarService {
  /**
   * Resolves avatar metadata including fallback initials safely.
   */
  public static resolveAvatar(avatarUrl?: string | null, name?: string | null): ResolvedAvatar {
    const hasCustomAvatar = Boolean(avatarUrl && avatarUrl.trim().length > 0)
    return {
      url: hasCustomAvatar ? avatarUrl!.trim() : null,
      initials: getInitialsFromName(name),
      hasCustomAvatar,
    }
  }

  /**
   * Transactional avatar upload with safe replacement ordering:
   * 1. Validate file size & MIME type
   * 2. Fetch current avatar reference
   * 3. Upload new object to avatars/{userId}/avatar-{timestamp}.{ext}
   * 4. Update database users.avatar_url
   * 5. If DB update fails -> rollback new storage object
   * 6. If DB update succeeds -> safely delete old storage object
   */
  public static async uploadAndSetUserAvatar({
    userId,
    fileBuffer,
    mimeType,
    fileName,
    supabaseClient,
  }: UploadAvatarParams): Promise<UploadAvatarResult> {
    if (!userId || !userId.trim()) {
      throw new Error('User ID is required for avatar upload.')
    }

    // 1. Validation
    const normalizedMime = (mimeType || '').toLowerCase().trim()
    if (!ALLOWED_AVATAR_MIME_TYPES.has(normalizedMime)) {
      throw new Error('Unsupported image format. Allowed formats: PNG, JPG, WebP.')
    }

    if (fileBuffer.byteLength > MAX_AVATAR_SIZE_BYTES) {
      throw new Error('Image file size exceeds maximum limit of 2MB.')
    }

    const supabase = supabaseClient || createServiceRoleClient()

    // 2. Fetch current avatar URL from DB to prepare for cleanup
    const { data: currentUser } = (await supabase
      .from('users')
      .select('avatar_url')
      .eq('id', userId)
      .maybeSingle()) as unknown as { data: { avatar_url: string | null } | null }

    const oldAvatarPath = extractAvatarStoragePath(currentUser?.avatar_url)

    // 3. Determine new storage path
    const ext = MIME_TO_EXT_MAP[normalizedMime] || fileName?.split('.').pop() || 'jpg'
    const newStoragePath = `${userId}/avatar-${Date.now()}.${ext}`

    // 4. Upload new image to Supabase storage
    const { error: uploadError } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(newStoragePath, fileBuffer, {
        contentType: normalizedMime,
        upsert: true,
      })

    if (uploadError) {
      console.error('[AvatarService] Storage upload failed:', uploadError)
      throw new Error(`Failed to upload avatar image: ${uploadError.message}`)
    }

    // 5. Compute public URL
    const { data: { publicUrl } } = supabase.storage
      .from(AVATAR_BUCKET)
      .getPublicUrl(newStoragePath)

    // 6. Update user profile reference in database
    const { error: dbError } = await supabase
      .from('users')
      .update({
        avatar_url: publicUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)

    // 7. Handle Database failure with rollback
    if (dbError) {
      console.error('[AvatarService] Database update failed, rolling back uploaded image:', dbError)
      // Rollback: delete newly uploaded object to prevent orphaned storage objects
      await supabase.storage
        .from(AVATAR_BUCKET)
        .remove([newStoragePath])
        .catch((rollbackErr: unknown) => {
          console.warn('[AvatarService] Non-fatal rollback cleanup error:', rollbackErr)
        })

      throw new Error(`Failed to save avatar reference to profile: ${dbError.message}`)
    }

    // 8. Safe Cleanup of old avatar object (non-blocking / non-fatal)
    if (oldAvatarPath && oldAvatarPath !== newStoragePath && oldAvatarPath.startsWith(`${userId}/`)) {
      try {
        await supabase.storage
          .from(AVATAR_BUCKET)
          .remove([oldAvatarPath])
      } catch (cleanupErr) {
        // Old avatar cleanup failure must NEVER fail the active user update
        console.warn('[AvatarService] Non-fatal old avatar cleanup warning:', cleanupErr)
      }
    }

    return {
      success: true,
      avatarUrl: publicUrl,
      storagePath: newStoragePath,
    }
  }

  /**
   * Safely removes user avatar from database and cleans up the storage object.
   */
  public static async removeUserAvatar(
    userId: string,
    supabaseClient?: unknown
  ): Promise<{ success: boolean }> {
    if (!userId || !userId.trim()) {
      throw new Error('User ID is required.')
    }

    const supabase = (supabaseClient as ReturnType<typeof createServiceRoleClient>) || createServiceRoleClient()

    // 1. Fetch current avatar URL
    const { data: currentUser } = (await supabase
      .from('users')
      .select('avatar_url')
      .eq('id', userId)
      .maybeSingle()) as unknown as { data: { avatar_url: string | null } | null }

    const oldAvatarPath = extractAvatarStoragePath(currentUser?.avatar_url)

    // 2. Clear database reference
    const { error: dbError } = await supabase
      .from('users')
      .update({
        avatar_url: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)

    if (dbError) {
      throw new Error(`Failed to remove avatar from profile: ${dbError.message}`)
    }

    // 3. Remove storage object if owned by this user
    if (oldAvatarPath && oldAvatarPath.startsWith(`${userId}/`)) {
      try {
        await supabase.storage
          .from(AVATAR_BUCKET)
          .remove([oldAvatarPath])
      } catch (cleanupErr) {
        console.warn('[AvatarService] Non-fatal avatar storage removal warning:', cleanupErr)
      }
    }

    return { success: true }
  }

  /**
   * Scans Supabase Storage bucket for unreferenced / orphaned avatar files.
   * Safe dry-run by default with configurable age threshold.
   */
  public static async cleanupOrphanedAvatars({
    dryRun = true,
    minAgeHours = 24,
    supabaseClient,
  }: {
    dryRun?: boolean
    minAgeHours?: number
    supabaseClient?: unknown
  } = {}): Promise<StorageCleanupResult> {
    const supabase = (supabaseClient as ReturnType<typeof createServiceRoleClient>) || createServiceRoleClient()
    const cutoffDate = new Date(Date.now() - minAgeHours * 60 * 60 * 1000)

    // 1. Fetch all active avatar_url paths referenced in the users table
    const { data: usersData, error: usersErr } = await supabase
      .from('users')
      .select('avatar_url')
      .not('avatar_url', 'is', null)

    if (usersErr) {
      throw new Error(`Failed to fetch active avatar references: ${usersErr.message}`)
    }

    const activePaths = new Set<string>()
    for (const u of (usersData || []) as Array<{ avatar_url: string | null }>) {
      const path = extractAvatarStoragePath(u.avatar_url)
      if (path) activePaths.add(path)
    }

    // 2. List user folders in avatars bucket
    const { data: rootItems, error: listErr } = await supabase.storage
      .from(AVATAR_BUCKET)
      .list('', { limit: 1000 })

    if (listErr) {
      throw new Error(`Failed to list avatars bucket: ${listErr.message}`)
    }

    let totalScanned = 0
    const orphanPaths: string[] = []
    const details: string[] = []

    for (const item of rootItems || []) {
      // If it's a user folder (has no id or is a folder)
      const userFolder = item.name
      const { data: files } = await supabase.storage
        .from(AVATAR_BUCKET)
        .list(userFolder, { limit: 1000 })

      for (const file of files || []) {
        totalScanned += 1
        const fullPath = `${userFolder}/${file.name}`
        const fileCreated = file.created_at ? new Date(file.created_at) : new Date(0)

        // Check if referenced
        if (!activePaths.has(fullPath)) {
          // Check age threshold to avoid deleting in-flight uploads
          if (fileCreated < cutoffDate) {
            orphanPaths.push(fullPath)
            details.push(`Orphan detected: ${fullPath} (created: ${fileCreated.toISOString()})`)
          }
        }
      }
    }

    let orphansDeleted = 0
    if (!dryRun && orphanPaths.length > 0) {
      // Delete in chunks of 50
      for (let i = 0; i < orphanPaths.length; i += 50) {
        const chunk = orphanPaths.slice(i, i + 50)
        const { error: removeErr } = await supabase.storage
          .from(AVATAR_BUCKET)
          .remove(chunk)

        if (!removeErr) {
          orphansDeleted += chunk.length
        }
      }
    }

    return {
      totalScanned,
      orphansFound: orphanPaths.length,
      orphansDeleted,
      dryRun,
      details,
    }
  }
}
