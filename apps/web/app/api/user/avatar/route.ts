import { requireUserId } from '@/lib/api/actor'
import { RouteError, withRoute } from '@/lib/api/with-route'
import { AvatarService, MAX_AVATAR_SIZE_BYTES, ALLOWED_AVATAR_MIME_TYPES } from '@/lib/avatar/avatar-service'

export const runtime = 'nodejs'

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
      const body = (await request.json().catch(() => ({}))) as {
        base64?: unknown
        mimeType?: string
        fileName?: string
      }
      if (!body.base64 || typeof body.base64 !== 'string') {
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

    const result = await AvatarService.uploadAndSetUserAvatar({
      userId: requireUserId(actor),
      fileBuffer,
      mimeType,
      fileName,
    })

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
    await AvatarService.removeUserAvatar(requireUserId(actor))
    return Response.json({ success: true, message: 'Avatar removed successfully.' }, { status: 200 })
  }
)
