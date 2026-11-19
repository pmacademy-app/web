import { z } from 'zod'

import { RouteError, withRoute } from '@/lib/api/with-route'
import {
  CLIENT_ERROR_APP,
  CLIENT_ERROR_BOUNDARIES,
  CLIENT_ERROR_SOURCES,
  MAX_CLIENT_ERROR_BODY_BYTES,
  MAX_CLIENT_ERROR_DIGEST_LENGTH,
  MAX_CLIENT_ERROR_MESSAGE_LENGTH,
  MAX_CLIENT_ERROR_PATH_LENGTH,
  MAX_CLIENT_ERROR_RELEASE_LENGTH,
  MAX_CLIENT_ERROR_STACK_LENGTH,
  stripStackUrlQueries,
  type ClientErrorSource,
} from '@/lib/monitoring/client-error-beacon'
import { logSystemError } from '@/lib/monitoring/logger'
import { evaluatePersistentRateLimit } from '@/lib/rate-limit'
import { getClientIpBucket } from '@/lib/security/client-ip'

export const runtime = 'nodejs'

/** Per-IP budget. A crashing page reports a handful of times at most; more is a flood. */
const CLIENT_ERROR_LIMIT = { limit: 10, windowMs: 60 * 1000 }

/**
 * Budget across ALL callers. The per-IP limit alone lets a botnet, or one client
 * rotating addresses, fill `system_errors`; this bounds the table's growth from this
 * endpoint to 300 rows per 10 minutes whatever the source. Charged only after the
 * per-IP rule passed, so one noisy address cannot spend everyone's budget.
 */
const CLIENT_ERROR_GLOBAL_LIMIT = { limit: 300, windowMs: 10 * 60 * 1000 }
const CLIENT_ERROR_GLOBAL_KEY = 'client_errors:global'

const clientErrorSchema = z
  .object({
    message: z.string().min(1).max(MAX_CLIENT_ERROR_MESSAGE_LENGTH),
    digest: z
      .string()
      .max(MAX_CLIENT_ERROR_DIGEST_LENGTH)
      .regex(/^[A-Za-z0-9_-]+$/)
      .optional(),
    path: z.string().min(1).max(MAX_CLIENT_ERROR_PATH_LENGTH).startsWith('/'),
    boundary: z.enum(CLIENT_ERROR_BOUNDARIES).optional(),
    // Absent on reports from a page built before the field existed: those all came
    // from a boundary.
    source: z.enum(CLIENT_ERROR_SOURCES).optional(),
    app: z.literal(CLIENT_ERROR_APP).optional(),
    stack: z.string().max(MAX_CLIENT_ERROR_STACK_LENGTH).optional(),
    release: z
      .string()
      .max(MAX_CLIENT_ERROR_RELEASE_LENGTH)
      .regex(/^[A-Za-z0-9._-]+$/)
      .optional(),
  })
  .strict()
  // A boundary report must say which boundary; a listener report has none.
  .refine((report) => (report.source ?? 'boundary') !== 'boundary' || Boolean(report.boundary))

const OPERATION_BY_SOURCE: Record<ClientErrorSource, string> = {
  boundary: 'client.error_boundary',
  'window.onerror': 'client.window_error',
  unhandledrejection: 'client.unhandled_rejection',
}

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
 * boundary renders or a window `error` / `unhandledrejection` listener fires.
 * Anonymous on purpose: a crash can happen before or after sign-in, and resolving a
 * session for every beacon would put an auth network round trip behind a page that
 * is already broken. So `user_id` stays empty on these rows; a user id in the body
 * would be refused by the strict schema, because a client-sent identity is never
 * trusted.
 *
 * The body is not declared to `withRoute`: it is read here, under a byte cap, so the
 * per-IP and global limiters run before any of it is buffered. Replies 204 with no
 * body.
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
    const global = await evaluatePersistentRateLimit(CLIENT_ERROR_GLOBAL_KEY, CLIENT_ERROR_GLOBAL_LIMIT)
    if (!global.success) {
      throw new RouteError(429, 'RATE_LIMITED', 'Too many requests. Please wait a while before trying again.', {
        resetInMs: global.resetInMs,
      })
    }

    const text = await readCappedText(request, MAX_CLIENT_ERROR_BODY_BYTES)

    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch {
      throw invalidReport()
    }

    const parsed = clientErrorSchema.safeParse(raw)
    if (!parsed.success) throw invalidReport()

    const { message, digest, path, boundary, stack, release } = parsed.data
    const source = parsed.data.source ?? 'boundary'
    const caughtBy = source === 'boundary' ? `the ${boundary} boundary` : source

    // The summary names the catcher and the message so distinct crashes get distinct
    // incidents; the logger redacts it and collapses ids before fingerprinting. The
    // path stays in `details` so one crash on many pages is still one incident.
    await logSystemError({
      severity: 'warning',
      category: 'api',
      operation: OPERATION_BY_SOURCE[source],
      message: `Client error caught by ${caughtBy}: ${message.slice(0, 200)}`,
      // Query strings are stripped again here: the browser is not trusted to have
      // done it. The logger then redacts and bounds the stack.
      ...(stack ? { stack: stripStackUrlQueries(stack) } : {}),
      runtime: 'client',
      ...(release ? { release } : {}),
      details: {
        ...(boundary ? { boundary } : {}),
        source,
        path,
        ...(digest ? { digest } : {}),
        clientMessage: message,
        requestId,
      },
    })

    return new Response(null, { status: 204 })
  }
)
