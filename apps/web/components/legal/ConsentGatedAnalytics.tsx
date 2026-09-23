'use client'

import Script from 'next/script'
import { GoogleAnalytics } from '@next/third-parties/google'
import { useCookieConsent } from '@/hooks/use-cookie-consent'

/**
 * Loads GA4 and Google Tag Manager only after the visitor accepts optional cookies.
 *
 * Before the audit these two were rendered unconditionally in `app/layout.tsx`, so
 * both fired on first paint with no consent gate. Returning `null` here means the
 * `<script>` tags are never injected at all — not injected-then-blocked — so no
 * request to google-analytics.com or googletagmanager.com leaves the browser and
 * no `_ga` cookie is written until consent exists.
 *
 * GTM is the reason this must be a hard gate rather than a consent-mode signal: a
 * loaded container can inject arbitrary further tags without a code change.
 *
 * The ids are passed in from the server layout so this component stays free of
 * environment lookups and can be exercised directly in tests.
 */
export function ConsentGatedAnalytics({ gaId, gtmId }: { gaId?: string; gtmId?: string }) {
  const { hasAccepted } = useCookieConsent()

  if (!hasAccepted) return null

  return (
    <>
      {gaId && <GoogleAnalytics gaId={gaId} />}

      {gtmId && (
        <Script
          id="gtm-script"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${gtmId}');`,
          }}
        />
      )}
    </>
  )
}
