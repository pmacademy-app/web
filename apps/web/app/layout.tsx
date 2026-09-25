import type { Metadata, Viewport } from 'next'
import { Inter, Fraunces } from 'next/font/google'
import { Analytics } from '@vercel/analytics/react'
import { CookieConsentBanner } from '@/components/legal/CookieConsentBanner'
import { ConsentGatedAnalytics } from '@/components/legal/ConsentGatedAnalytics'
import { TooltipProvider } from '@/components/ui/tooltip'
import { BRAND } from '@/lib/brand'
import { safeJsonLd } from '@/lib/seo/safe-json-ld'
import { ApiClientProvider } from '@/lib/api/hooks'
import '@/app/globals.css'

// ─── Fonts ────────────────────────────────────────────────────────────────────

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
  preload: true,
})

const fraunces = Fraunces({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-fraunces',
  axes: ['opsz', 'SOFT', 'WONK'],
  preload: true,
})

// ─── Metadata ─────────────────────────────────────────────────────────────────

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? BRAND.siteUrl

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),

  title: {
    default: BRAND.metadata.homeTitle,
    template: BRAND.metadata.titleTemplate,
  },

  description: BRAND.metadata.description,

  keywords: [
    'Product Management course',
    'free PM curriculum',
    'learn product management',
    'PM skills',
    'product manager training',
    'PM portfolio',
    'product thinking',
  ],

  authors: [{ name: BRAND.fullName, url: siteUrl }],

  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    other: [
      { rel: 'mask-icon', url: BRAND.assets.safariPinnedTab, color: BRAND.colors.primary },
    ],
  },

  openGraph: {
    type: 'website',
    url: siteUrl,
    siteName: BRAND.fullName,
    title: BRAND.metadata.homeTitle,
    description: BRAND.metadata.shortDescription,
    images: [
      {
        url: BRAND.assets.ogImage,
        width: BRAND.assets.ogImageDimensions.width,
        height: BRAND.assets.ogImageDimensions.height,
        alt: BRAND.metadata.homeTitle,
      },
    ],
  },

  twitter: {
    card: 'summary_large_image',
    title: BRAND.metadata.homeTitle,
    description: BRAND.metadata.shortDescription,
    images: [BRAND.assets.ogImage],
  },

  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },

  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
    other: process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION
      ? { 'msvalidate.01': process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION }
      : undefined,
  },
}

export const viewport: Viewport = {
  themeColor: BRAND.colors.background,
  width: 'device-width',
  initialScale: 1,
}

// ─── Analytics ────────────────────────────────────────────────────────────────

// Both are non-essential and therefore consent-gated: `ConsentGatedAnalytics`
// injects neither script until the visitor accepts optional cookies. Vercel Web
// Analytics below is cookieless and collects no identifiers, so it is not gated.
const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID
const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID

// ─── JSON-LD Structured Data ──────────────────────────────────────────────────

import { getEducationalOrganizationSchema, getWebSiteSchema } from '@/lib/schema'

// ─── Root Layout ──────────────────────────────────────────────────────────────

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const orgSchema = getEducationalOrganizationSchema()
  const siteSchema = getWebSiteSchema()

  return (
    <html
      lang="en"
      className={`${inter.variable} ${fraunces.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(orgSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(siteSchema) }}
        />
      </head>
      <body>
        <ApiClientProvider>
          <TooltipProvider>
            {children}
          </TooltipProvider>
        </ApiClientProvider>

        {/* Google Analytics 4 + Google Tag Manager — loaded only after consent */}
        <ConsentGatedAnalytics gaId={GA_ID} gtmId={GTM_ID} />

        {/* Vercel Web Analytics (cookieless, no identifiers) */}
        <Analytics />

        <CookieConsentBanner />
      </body>
    </html>
  )
}
