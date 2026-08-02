import path from 'path'

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Optimise production builds
  poweredByHeader: false,

  // Image optimization
  images: {
    formats: ['image/avif', 'image/webp'],
  },

  // Use absolute path to silence "turbopack.root should be absolute" warning
  turbopack: {
    root: path.resolve(__dirname, '../../'),
  },

  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ]
  },
}

export default nextConfig
