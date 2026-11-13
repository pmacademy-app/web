import { z } from 'zod'

import { RouteError, withRoute } from '@/lib/api/with-route'
import {
  CLIENT_ERROR_BOUNDARIES,
  MAX_CLIENT_ERROR_BODY_BYTES,
  MAX_CLIENT_ERROR_DIGEST_LENGTH,
  MAX_CLIENT_ERROR_MESSAGE_LENGTH,
  MAX_CLIENT_ERROR_PATH_LENGTH,
} from '@/lib/monitoring/client-error-beacon'
import { logSystemError } from '@/lib/monitoring/logger'
import { getClientIpBucket } from '@/lib/security/client-ip'

export const runtime = 'nodejs'

/** Per-IP budget. A crashing page reports a handful of times at most; more is a flood. */
const CLIENT_ERROR_LIMIT = { limit: 10, windowMs: 60 * 1000 }

const clientErrorSchema = z
  .object({
    message: z.string().min(1).max(MAX_CLIENT_ERROR_MESSAGE_LENGTH),
    digest: z
      .string()
      .max(MAX_CLIENT_ERROR_DIGEST_LENGTH)
      .regex(/^[A-Za-z0-9_-]+$/)
      .optional(),
    path: z.string().min(1).max(MAX_CLIENT_ERROR_PATH_LENGTH).startsWith('/'),
    boundary: z.enum(CLIENT_ERROR_BOUNDARIES),
  })
  .strict()

const payloadTooLarge = () => new RouteError(413, 'PAYLOAD_TOO_LARGE', 'Report is too large.')
const invalidReport = () => new RouteError(400, 'VALIDATION', 'Invalid error report.')

/**
 * Reads the body as text, refusing once it passes `maxBytes`.
 *
 * The declared length is checked first so an honest oversized request is refused
 * without reading it; the stream is then counted as it arrives, because the header
 * is optional and can lie. Either way no more than `maxBytes` is ever buffered.
 */
async function readCappedText(request: Request, maxBytes: number): Promise<string> {
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) throw payloadTooLarge()

  if (!request.body) return ''

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    received += value.byteLength
    if (received > maxBytes) {
      await reader.cancel().catch(() => {})
      throw payloadTooLarge()
    }
    chunks.push(value)
  }

  const joined = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    joined.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(joined)
}

/**
 * POST /api/client-errors
 *
 * Receives the report `lib/monitoring/client-error-beacon.ts` sends when an error
 * boundary renders. Anonymous on purpose: a crash can happen before or after sign-in,
 * the report carries no identity, and resolving a session for every beacon would put
 * an auth round trip behind a page that is already broken.
 *
 * The body is not declared to `withRoute`: it is read here, under a byte cap, so the
 * per-IP limiter runs before any of it is buffered. Replies 204 with no body.
 */
export const POST = withRoute(
  {
    actor: { allow: ['anonymous'] },
    operation: 'client_errors.report',
    domain: 'api',
    summary: 'Unhandled exception in /api/client-errors',
    rateLimit: [
      {
        key: ({ request }) => `client_errors:${getClientIpBucket(request)}`,
        ...CLIENT_ERROR_LIMIT,
      },
    ],
  },
  async ({ request, requestId }) => {
    const text = await readCappedText(request, MAX_CLIENT_ERROR_BODY_BYTES)

    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch {
      throw invalidReport()
    }

    const parsed = clientErrorSchema.safeParse(raw)
    if (!parsed.success) throw invalidReport()

    const { message, digest, path, boundary } = parsed.data

    // The summary names the boundary and the message so distinct crashes get distinct
    // incidents; the logger redacts it and collapses ids before fingerprinting. The
    // path stays in `details` so one crash on many pages is still one incident.
    await logSystemError({
      severity: 'warning',
      category: 'api',
      operation: 'client.error_boundary',
      message: `Client error caught by the ${boundary} boundary: ${message.slice(0, 200)}`,
      details: {
        boundary,
        path,
        ...(digest ? { digest } : {}),
        clientMessage: message,
        requestId,
      },
    })

    return new Response(null, { status: 204 })
  }
)
