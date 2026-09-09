/**
 * Trusted client-IP extraction.
 *
 * Every abuse control keyed on "the client's IP" is only as good as the way that IP
 * is derived. The signup route previously used the LEFTMOST value of
 * `X-Forwarded-For`, which is the one part of that header a client fully controls:
 * an attacker sends `X-Forwarded-For: 1.2.3.4` and the proxy APPENDS its observed
 * address after it. Reading position 0 therefore reads the attacker's own string, so
 * rotating a header value gives an unlimited supply of fresh rate-limit buckets. That
 * is how the per-IP signup limit added after the 2026-09-06 incident was bypassed on
 * 2026-09-09.
 *
 * The correct read is the address the *trusted* proxy observed, which sits at the
 * RIGHT end of the chain, not the left.
 */

/**
 * Number of proxies we operate in front of the app. `X-Forwarded-For` is read that
 * many hops in from the right. 0 (the default) means the last value in the chain is
 * the one our edge observed.
 *
 * Only raise this if real infrastructure is added in front of Vercel (e.g. a
 * corporate WAF), and only after confirming that proxy appends rather than replaces.
 */
function trustedProxyHops(): number {
  const raw = Number(process.env.TRUSTED_PROXY_HOP_COUNT)
  if (!Number.isFinite(raw) || raw < 0) return 0
  return Math.floor(raw)
}

/** Rejects obvious junk so a malformed header cannot become a shared bucket key. */
function normalizeIp(value: string | undefined | null): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  // Strip an IPv6 bracket/port form (`[::1]:443`) and a trailing IPv4 port.
  const unbracketed = trimmed.startsWith('[') ? trimmed.slice(1).split(']')[0] : trimmed
  const withoutPort =
    unbracketed.includes(':') && unbracketed.split(':').length === 2
      ? unbracketed.split(':')[0]
      : unbracketed
  const candidate = withoutPort.trim()
  if (!candidate || candidate.length > 64) return null
  // Only accept something that at least looks like an address, so header garbage
  // ("unknown", an injected template string) never becomes a rate-limit key.
  const isIpv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(candidate)
  const isIpv6 = /^[0-9a-f:]+$/i.test(candidate) && candidate.includes(':')
  return isIpv4 || isIpv6 ? candidate.toLowerCase() : null
}

/**
 * Resolves the client IP a rate limiter may safely key on.
 *
 * Resolution order:
 *  1. `x-vercel-forwarded-for` — set by the Vercel edge on every request and stripped
 *     from client input, so it cannot be forged from outside.
 *  2. `x-real-ip` — likewise set by the platform proxy.
 *  3. `x-forwarded-for`, read `trustedProxyHops()` entries in from the RIGHT.
 *
 * Returns `null` when no trustworthy address is available. Callers decide what that
 * means; for anything that spends money the answer must not be "one shared bucket
 * that every anonymous request falls into", so `null` is deliberately distinct from
 * a real address rather than being coerced to `'unknown'`.
 */
export function getTrustedClientIp(request: { headers: { get(name: string): string | null } }): string | null {
  const platformIp =
    normalizeIp(request.headers.get('x-vercel-forwarded-for')?.split(',')[0]) ||
    normalizeIp(request.headers.get('x-real-ip'))
  if (platformIp) return platformIp

  const chain = request.headers.get('x-forwarded-for')
  if (!chain) return null

  const hops = chain
    .split(',')
    .map((part) => normalizeIp(part))
    .filter((part): part is string => Boolean(part))

  if (hops.length === 0) return null

  const index = hops.length - 1 - trustedProxyHops()
  return hops[Math.max(0, index)] ?? null
}

/**
 * Rate-limit bucket for a request.
 *
 * When no trusted IP can be derived, every such request shares the single
 * `ip:unresolved` bucket. That is intentional: it makes an unidentifiable flood
 * throttle *itself* collectively instead of granting each request its own budget.
 */
export function getClientIpBucket(request: { headers: { get(name: string): string | null } }): string {
  return getTrustedClientIp(request) ?? 'unresolved'
}
