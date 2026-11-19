import { NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { z } from 'zod'

import { RouteError, withRoute } from '@/lib/api/with-route'
import { classifyRevalidatePath, isRevalidatableTag } from '@/lib/internal/revalidate-allowlist'
import { getClientIpBucket } from '@/lib/security/client-ip'
import { secretsMatch } from '@/lib/security/constant-time'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_ENTRIES = 50

const bodySchema = z
  .object({
    tags: z
      .array(
        z.object({
          tag: z.string().refine(isRevalidatableTag, { message: 'Tag is not revalidatable.' }),
          expire: z.number().int().min(0).optional(),
        })
      )
      .max(MAX_ENTRIES)
      .optional(),
    paths: z
      .array(z.string().refine((path) => classifyRevalidatePath(path) !== null, { message: 'Path is not revalidatable.' }))
      .max(MAX_ENTRIES)
      .optional(),
  })
  .refine((body) => (body.tags?.length ?? 0) + (body.paths?.length ?? 0) > 0, {
    message: 'Nothing to revalidate.',
  })

type RevalidateBody = z.infer<typeof bodySchema>

function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization')
  if (!header) return null
  const match = /^Bearer\s+(.+)$/i.exec(header)
  return match ? match[1].trim() : null
}

/**
 * True when the request carries `INTERNAL_REVALIDATE_SECRET`, compared in constant time.
 *
 * Fail closed: with the secret unset, every request is refused, except under
 * NODE_ENV `development` or `test`, where a local admin app can call without one.
 */
function isAuthorized(request: Request): boolean {
  const expected = process.env.INTERNAL_REVALIDATE_SECRET
  if (!expected) {
    return process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test'
  }
  const provided = bearerToken(request)
  return provided !== null && secretsMatch(provided, expected)
}

/**
 * POST /api/internal/revalidate
 *
 * The admin console (separate repository and host) calls this from its server after a
 * write that changes what learner pages show, because `revalidateTag` and
 * `revalidatePath` only reach the cache of the app that calls them.
 *
 * Auth is the `Authorization: Bearer <INTERNAL_REVALIDATE_SECRET>` header, checked
 * before the body is read, so an unauthenticated caller always gets 401. The actor
 * policy is `anonymous` because the caller has no session; the shared secret is the
 * credential. The proxy matcher and the same-origin check both skip this path.
 *
 * Body: `{ tags?: { tag, expire? }[], paths?: string[] }`, at most 50 of each, every
 * entry on the allowlist in lib/internal/revalidate-allowlist.ts. `expire: 0` expires a
 * tag at once; anything else uses the `'max'` stale-while-revalidate profile.
 */
export const POST = withRoute(
  {
    actor: { allow: ['anonymous'] },
    operation: 'internal.revalidate',
    summary: 'Unexpected failure revalidating learner caches for the admin console',
    rateLimit: [
      {
        key: ({ request }) => `internal_revalidate:${getClientIpBucket(request)}`,
        limit: 120,
        windowMs: 60 * 1000,
      },
    ],
  },
  async ({ request }) => {
    if (!isAuthorized(request)) {
      throw new RouteError(401, 'UNAUTHORIZED', 'Authentication required.')
    }

    let raw: unknown
    try {
      raw = await request.json()
    } catch {
      throw new RouteError(400, 'VALIDATION', 'Invalid request body. JSON object expected.')
    }

    const parsed = bodySchema.safeParse(raw)
    if (!parsed.success) {
      throw new RouteError(400, 'VALIDATION', parsed.error.issues[0]?.message || 'Invalid request body.')
    }
    const body: RevalidateBody = parsed.data

    const tags: string[] = []
    for (const { tag, expire } of body.tags ?? []) {
      revalidateTag(tag, expire === 0 ? { expire: 0 } : 'max')
      if (!tags.includes(tag)) tags.push(tag)
    }

    const paths: string[] = []
    for (const path of new Set(body.paths ?? [])) {
      if (classifyRevalidatePath(path) === 'layout') {
        revalidatePath(path, 'layout')
      } else {
        revalidatePath(path)
      }
      paths.push(path)
    }

    return NextResponse.json({ revalidated: { tags, paths } }, { status: 200 })
  }
)
