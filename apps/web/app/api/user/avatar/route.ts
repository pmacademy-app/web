import { getAuthenticatedUserFromRequest } from '@/lib/auth'
import { AvatarService, MAX_AVATAR_SIZE_BYTES, ALLOWED_AVATAR_MIME_TYPES } from '@/lib/avatar/avatar-service'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUserFromRequest(request)
    if (!user) {
      return Response.json({ error: 'Unauthorized. Authenticated session required.' }, { status: 401 })
    }

    let fileBuffer: Buffer | Uint8Array
    let mimeType: string
    let fileName: string = 'avatar.jpg'

    const contentType = request.headers.get('content-type') || ''

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      const file = formData.get('file') as File | null
      if (!file || typeof file === 'string') {
        return Response.json({ error: 'Image file is required.' }, { status: 400 })
      }

      mimeType = file.type || 'image/jpeg'
      fileName = file.name || 'avatar.jpg'
      const arrayBuffer = await file.arrayBuffer()
      fileBuffer = Buffer.from(arrayBuffer)
    } else {
      // JSON payload support (e.g. base64)
      const body = await request.json().catch(() => ({}))
      if (!body.base64 || typeof body.base64 !== 'string') {
        return Response.json({ error: 'Image data or multipart file is required.' }, { status: 400 })
      }

      mimeType = body.mimeType || 'image/jpeg'
      fileName = body.fileName || 'avatar.jpg'
      const cleanBase64 = body.base64.replace(/^data:image\/[a-z]+;base64,/, '')
      fileBuffer = Buffer.from(cleanBase64, 'base64')
    }

    // Server-side validation
    if (!ALLOWED_AVATAR_MIME_TYPES.has(mimeType.toLowerCase())) {
      return Response.json({ error: 'Unsupported image format. Allowed formats: PNG, JPG, WebP.' }, { status: 400 })
    }

    if (fileBuffer.byteLength > MAX_AVATAR_SIZE_BYTES) {
      return Response.json({ error: 'Image file size exceeds maximum limit of 2MB.' }, { status: 400 })
    }

    const result = await AvatarService.uploadAndSetUserAvatar({
      userId: user.id,
      fileBuffer,
      mimeType,
      fileName,
    })

    return Response.json({ success: true, avatarUrl: result.avatarUrl }, { status: 200 })
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'An error occurred during avatar upload.'
    console.error('[POST /api/user/avatar] Upload exception:', err)
    return Response.json({ success: false, error: errorMsg }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getAuthenticatedUserFromRequest(request)
    if (!user) {
      return Response.json({ error: 'Unauthorized. Authenticated session required.' }, { status: 401 })
    }

    await AvatarService.removeUserAvatar(user.id)
    return Response.json({ success: true, message: 'Avatar removed successfully.' }, { status: 200 })
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'An error occurred while removing avatar.'
    console.error('[DELETE /api/user/avatar] Removal exception:', err)
    return Response.json({ success: false, error: errorMsg }, { status: 500 })
  }
}
