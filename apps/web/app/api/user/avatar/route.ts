import { requireUserId } from '@/lib/api/actor'
import { RouteError, withRoute } from '@/lib/api/with-route'
import { parseBody } from '@/lib/api/contracts/body'
import { avatarJsonUploadBodySchema } from '@/lib/api/contracts/learner-writes'
import { AvatarService, MAX_AVATAR_SIZE_BYTES, ALLOWED_AVATAR_MIME_TYPES } from '@/lib/avatar/avatar-service'
import { invalidateLeaderboardCache } from '@/lib/leaderboard/leaderboard-db'
import { revalidatePublicPortfolioForUser } from '@/lib/portfolio/portfolio-revalidate'
import { createServiceRoleClient } from '@/lib/supabase'

export const runtime = 'nodejs'

/**
 * The avatar shows on the cached public portfolio (ISR, 1 hour) and the cached weekly
 * leaderboard (5 minutes), so a change purges both. Best-effort: both helpers never throw.
 */
async function purgeAvatarCaches(userId: string): Promise<void> {
  invalidateLeaderboardCache('max')
  await revalidatePublicPortfolioForUser(createServiceRoleClient(), userId)
}

/** Reads the image type from the file signature: PNG, JPEG or WebP, otherwise null. */
function sniffImageMimeType(bytes: Uint8Array): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  const startsWith = (sig: number[], offset = 0) =>
    bytes.length >= offset + sig.length && sig.every((b, i) => bytes[offset + i] === b)

  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (startsWith([0xff, 0xd8, 0xff])) return 'image/jpeg'
  // "RIFF" <4-byte size> "WEBP"
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp'
  return null
}

export const POST = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'user.avatar.upload',
    summary: 'Unexpected failure uploading a learner avatar',
    errorMessage: 'An error occurred during avatar upload.',
    // N-4: an authenticated write that spends storage and had no ceiling before
    // this batch. 10/hour is well past any real re-crop session and bounds a
    // scripted upload flood. No body schema is declared — the handler owns the
    // stream because the payload may be multipart.
    rateLimit: [
      {
        key: ({ actor }) => (actor.kind === 'learner' ? `avatar_upload_${actor.userId}` : null),
        limit: 10,
        windowMs: 60 * 60 * 1000,
      },
    ],
  },
  async ({ request, actor }) => {
    let fileBuffer: Buffer | Uint8Array
    let mimeType: string
    let fileName: string = 'avatar.jpg'

    const contentType = request.headers.get('content-type') || ''

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      const file = formData.get('file') as File | null
      if (!file || typeof file === 'string') {
        throw new RouteError(400, 'VALIDATION', 'Image file is required.')
      }

      mimeType = file.type || 'image/jpeg'
      fileName = file.name || 'avatar.jpg'
      const arrayBuffer = await file.arrayBuffer()
      fileBuffer = Buffer.from(arrayBuffer)
    } else {
      // JSON payload support (e.g. base64)
      // Hand-parsed because the multipart branch above owns the stream. An absent
      // body keeps its existing copy; a parsed one must be the three string fields.
      const parsed = parseBody(avatarJsonUploadBodySchema, await request.json().catch(() => ({})))
      if (!parsed.ok) throw new RouteError(400, 'VALIDATION', parsed.message)
      const body = parsed.data
      if (!body.base64) {
        throw new RouteError(400, 'VALIDATION', 'Image data or multipart file is required.')
      }

      mimeType = body.mimeType || 'image/jpeg'
      fileName = body.fileName || 'avatar.jpg'
      const cleanBase64 = body.base64.replace(/^data:image\/[a-z]+;base64,/, '')
      fileBuffer = Buffer.from(cleanBase64, 'base64')
    }

    // Server-side validation
    if (!ALLOWED_AVATAR_MIME_TYPES.has(mimeType.toLowerCase())) {
      throw new RouteError(400, 'VALIDATION', 'Unsupported image format. Allowed formats: PNG, JPG, WebP.')
    }

    if (fileBuffer.byteLength > MAX_AVATAR_SIZE_BYTES) {
      throw new RouteError(400, 'VALIDATION', 'Image file size exceeds maximum limit of 2MB.')
    }

    // The declared type is caller-controlled. Store under the type the bytes prove,
    // and refuse a file whose bytes disagree with what it claims to be.
    const sniffedType = sniffImageMimeType(fileBuffer)
    const declaredType = mimeType.toLowerCase() === 'image/jpg' ? 'image/jpeg' : mimeType.toLowerCase()
    if (!sniffedType || sniffedType !== declaredType) {
      throw new RouteError(400, 'VALIDATION', 'File content does not match a supported image format (PNG, JPG, WebP).')
    }

    const userId = requireUserId(actor)
    const result = await AvatarService.uploadAndSetUserAvatar({
      userId,
      fileBuffer,
      mimeType: sniffedType,
      fileName,
    })
    await purgeAvatarCaches(userId)

    return Response.json({ success: true, avatarUrl: result.avatarUrl }, { status: 200 })
  }
)

export const DELETE = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'user.avatar.remove',
    summary: 'Unexpected failure removing a learner avatar',
    errorMessage: 'An error occurred while removing avatar.',
  },
  async ({ actor }) => {
    const userId = requireUserId(actor)
    await AvatarService.removeUserAvatar(userId)
    await purgeAvatarCaches(userId)
    return Response.json({ success: true, message: 'Avatar removed successfully.' }, { status: 200 })
  }
)
