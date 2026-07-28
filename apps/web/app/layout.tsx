import type { Metadata, Viewport } from 'next'
import { Inter, Fraunces } from 'next/font/google'
import Script from 'next/script'
import { GoogleAnalytics } from '@next/third-parties/google'
import { TooltipProvider } from '@/components/ui/tooltip'
import AuthStateListener from '@/components/layout/AuthStateListener'
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

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://pmacademy.com'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),

  title: {
    default: 'PM Academy — Learn Product Management Free',
    template: '%s | PM Academy',
  },

  description:
    'A complete, free Product Management curriculum with 90 structured lessons, interactive quizzes, skill analytics, and portfolio projects. Built for career switchers and ambitious builders.',

  keywords: [
    'Product Management course',
    'free PM curriculum',
    'learn product management',
    'PM skills',
    'product manager training',
    'PM portfolio',
    'product thinking',
  ],

  authors: [{ name: 'PM Academy', url: siteUrl }],

  openGraph: {
    type: 'website',
    url: siteUrl,
    siteName: 'PM Academy',
    title: 'PM Academy — Learn Product Management Free',
    description: '90 lessons. 9 modules. One skill: product judgment. Completely free.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'PM Academy — Learn Product Management Free',
      },
    ],
  },

  twitter: {
    card: 'summary_large_image',
    title: 'PM Academy — Learn Product Management Free',
    description: '90 lessons. 9 modules. One skill: product judgment. Completely free.',
    images: ['/og-image.png'],
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
  themeColor: '#FBFAF6',
  width: 'device-width',
  initialScale: 1,
}

// ─── Analytics ────────────────────────────────────────────────────────────────

const GA_ID  = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID
const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID

// ─── JSON-LD Structured Data ──────────────────────────────────────────────────

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'PM Academy',
  url: siteUrl,
  description: 'A free Product Management learning platform with structured lessons, skill analytics, and portfolio projects.',
}

const websiteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'PM Academy',
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

        {/* Google Tag Manager — architecture-ready */}
        {GTM_ID && (
          <Script id="gtm-init" strategy="afterInteractive">
            {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
              new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
              j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
              'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
              })(window,document,'script','dataLayer','${GTM_ID}');`}
          </Script>
        )}

        {/* Google Analytics 4 */}
        {process.env.NODE_ENV === 'production' && GA_ID && (
          <GoogleAnalytics gaId={GA_ID} />
        )}
      </body>
    </html>
  )
}
