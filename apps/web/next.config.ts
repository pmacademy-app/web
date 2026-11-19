import path from 'path'
import { assertTurnstileBuildConfig } from './lib/security/turnstile-env'

// Fail a production build that would ship a signup page with no Turnstile widget.
// NEXT_PUBLIC_TURNSTILE_SITE_KEY is inlined at build time, so a missing value cannot
// be recovered at runtime — see lib/security/turnstile-env.ts.
assertTurnstileBuildConfig()

const isProduction = process.env.NODE_ENV === 'production'

/**
 * The Supabase project origin, read at build time. Null when the variable is absent or
 * malformed; callers then fall back to the wider Supabase pattern so nothing breaks.
 */
function supabaseOrigin(): URL | null {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '')
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null
  } catch {
    return null
  }
}

const supabase = supabaseOrigin()

/**
 * Content-Security-Policy (M1).
 *
 * script-src keeps 'unsafe-inline': a nonce would force every page to render
 * dynamically (Next docs, CSP guide), which would undo ISR on the marketing, lesson and
 * portfolio pages. 'unsafe-eval' is development only (React's debug stacks need it;
 * neither React nor Next uses eval in production), except when Google Tag Manager is
 * configured: a GTM container's Custom JavaScript variables are evaluated with eval,
 * and the container is edited outside this repo.
 *
 * connect-src lists every origin the browser talks to: same origin (API routes, Vercel
 * Analytics and Speed Insights under /_vercel), the Supabase project (the reset-password
 * request uses the browser client), GA4 and GTM collection endpoints, and Turnstile.
 */
function contentSecurityPolicy(): string {
  const allowEval = !isProduction || Boolean(process.env.NEXT_PUBLIC_GTM_ID)
  const supabaseConnect = supabase
    ? [supabase.origin, `${supabase.protocol === 'https:' ? 'wss' : 'ws'}://${supabase.host}`]
    : ['https://*.supabase.co', 'wss://*.supabase.co', 'https://*.supabase.in', 'wss://*.supabase.in']
  const devConnect = isProduction ? [] : ['ws:', 'http://localhost:*', 'http://127.0.0.1:*']

  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      "'unsafe-inline'",
      ...(allowEval ? ["'unsafe-eval'"] : []),
      'https://www.googletagmanager.com',
      'https://www.google-analytics.com',
      'https://challenges.cloudflare.com',
      ...(isProduction ? [] : ['https://va.vercel-scripts.com']),
    ],
    'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    'img-src': ["'self'", 'data:', 'blob:', 'https:'],
    'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],
    'frame-src': ["'self'", 'https://challenges.cloudflare.com'],
    'connect-src': [
      "'self'",
      ...supabaseConnect,
      'https://*.google-analytics.com',
      'https://*.analytics.google.com',
      'https://*.googletagmanager.com',
      // GA4 with Google Signals (Google's published CSP list for gtag.js).
      'https://*.g.doubleclick.net',
      'https://*.google.com',
      'https://challenges.cloudflare.com',
      ...devConnect,
    ],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  }
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ') + ';'
}

/**
 * Remote image hosts for next/image (L6): the Supabase project host only when it is known
 * at build time (the wide pattern otherwise), and plain-HTTP local hosts only outside
 * production.
 */
function imageRemotePatterns() {
  const patterns: Array<{ protocol: 'http' | 'https'; hostname: string }> = supabase
    ? [{ protocol: supabase.protocol === 'http:' ? 'http' : 'https', hostname: supabase.hostname }]
    : [
        { protocol: 'https', hostname: '**.supabase.co' },
        { protocol: 'https', hostname: '**.supabase.in' },
      ]
  if (!isProduction) {
    patterns.push({ protocol: 'http', hostname: '127.0.0.1' }, { protocol: 'http', hostname: 'localhost' })
  }
  return patterns
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Optimise production builds
  poweredByHeader: false,

  // Release tag for browser error reports (lib/monitoring/client-error-beacon.ts).
  // Vercel exposes NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA only while "Automatically expose
  // System Environment Variables" is on, so the server-side VERCEL_GIT_COMMIT_SHA is the
  // fallback. `env` values are inlined at build time; a commit SHA is not a secret.
  env: {
    NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA:
      process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || '',
  },

  // React Compiler (performance plan item 4): automatic memoization of client components.
  // Runs through babel-plugin-react-compiler (devDependency). Opt a component out with
  // the 'use no memo' directive if it misbehaves.
  reactCompiler: true,

  // Image optimization
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: imageRemotePatterns(),
  },

  // Use absolute path to silence "turbopack.root should be absolute" warning
  turbopack: {
    root: path.resolve(process.cwd(), process.cwd().includes('apps') ? '../..' : '.'),
  },

  // Security headers & static asset CORS rules
  async headers() {
    return [
      {
        source: '/_next/static/(.*)',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
        ],
      },
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          // The legacy XSS auditor is gone from modern browsers and was itself an XSS vector
          // in old ones; 0 disables it everywhere (OWASP).
          { key: 'X-XSS-Protection', value: '0' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value: contentSecurityPolicy(),
          },
        ],
      },
    ]
  },
}

export default nextConfig
