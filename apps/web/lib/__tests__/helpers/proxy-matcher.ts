/**
 * Evaluates the proxy `config.matcher` the way Next.js does at request time.
 *
 * The matcher mixes plain strings with `{ source, has }` objects (perf plan item 15),
 * so a hand-rolled `new RegExp(pattern)` no longer models it. This compiles the config
 * with Next's own build-time compiler (`getMiddlewareMatchers`, the code that writes the
 * middleware manifest) and evaluates it with Next's own runtime matcher
 * (`getMiddlewareRouteMatcher`, which applies `has`/`missing`). Neither is public API,
 * so they are loaded from `next/dist` by path; a Next upgrade that moves them fails
 * these tests loudly rather than silently.
 */
import { createRequire } from 'node:module'
import { config as proxyConfig } from '../../../proxy'

const nodeRequire = createRequire(import.meta.url)

type CompiledMatcher = {
  regexp: string
  has?: unknown[]
  missing?: unknown[]
}

const { getMiddlewareMatchers } = nodeRequire('next/dist/build/analysis/get-page-static-info') as {
  getMiddlewareMatchers: (matcher: unknown, nextConfig: Record<string, unknown>) => CompiledMatcher[]
}
const { getMiddlewareRouteMatcher } = nodeRequire('next/dist/shared/lib/router/utils/middleware-route-matcher') as {
  getMiddlewareRouteMatcher: (
    matchers: CompiledMatcher[]
  ) => (pathname: string, req: { headers: Record<string, string>; cookies: Record<string, string> }, query: Record<string, string>) => boolean
}

const routeMatcher = getMiddlewareRouteMatcher(getMiddlewareMatchers(proxyConfig.matcher, {}))

export interface MatchRequest {
  cookies?: Record<string, string>
  query?: Record<string, string>
}

/** True when a request for `pathname` (with these cookies and query) enters the proxy. */
export function entersProxy(pathname: string, { cookies = {}, query = {} }: MatchRequest = {}): boolean {
  return routeMatcher(pathname, { headers: {}, cookies }, query)
}

/** A signed-in browser: both session cookies present. */
export const SIGNED_IN: MatchRequest = { cookies: { 'sb-access-token': 'at', 'sb-refresh-token': 'rt' } }
