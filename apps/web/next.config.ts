import path from 'path'
import { assertTurnstileBuildConfig } from './lib/security/turnstile-env'

// Fail a production build that would ship a signup page with no Turnstile widget.
// NEXT_PUBLIC_TURNSTILE_SITE_KEY is inlined at build time, so a missing value cannot
// be recovered at runtime — see lib/security/turnstile-env.ts.
assertTurnstileBuildConfig()

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Optimise production builds
  poweredByHeader: false,

  // Image optimization
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
      {
        protocol: 'https',
        hostname: '**.supabase.in',
      },
      {
        protocol: 'http',
        hostname: '127.0.0.1',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
      },
    ],
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
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https:; font-src 'self' data: https://fonts.gstatic.com; frame-src 'self' https://challenges.cloudflare.com; connect-src 'self' https: wss:;",
          },
        ],
      },
    ]
  },
}

export default nextConfig
