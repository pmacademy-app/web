import type { Metadata, Viewport } from 'next'
import { Inter, Fraunces } from 'next/font/google'
import Script from 'next/script'
import { GoogleAnalytics } from '@next/third-parties/google'
import { TooltipProvider } from '@/components/ui/tooltip'
import AuthStateListener from '@/components/layout/AuthStateListener'
import { BRAND } from '@/lib/brand'
import '@/app/globals.css'

// ─── Fonts ────────────────────────────────────────────────────────────────────

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

const fraunces = Fraunces({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-fraunces',
  axes: ['opsz', 'SOFT', 'WONK'],
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

  alternates: {
    canonical: siteUrl,
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

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID
const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID

// ─── JSON-LD Structured Data ──────────────────────────────────────────────────

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: BRAND.fullName,
  url: siteUrl,
  description: 'A free Product Management learning platform with structured lessons, skill analytics, and portfolio projects.',
}

const websiteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: BRAND.fullName,
  url: siteUrl,
  description: 'Learn Product Management free. 90 lessons, 9 modules, portfolio-ready capstones.',
}

// ─── Root Layout ──────────────────────────────────────────────────────────────

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${fraunces.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
      </head>
      <body>
        <TooltipProvider>
          <AuthStateListener />
          {children}
        </TooltipProvider>

        {/* Google Analytics 4 */}
        {GA_ID && <GoogleAnalytics gaId={GA_ID} />}

        {/* Google Tag Manager (optional) */}
        {GTM_ID && (
          <Script
            id="gtm-script"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');`,
            }}
          />
        )}
      </body>
    </html>
  )
}
