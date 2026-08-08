import { TOKENS } from '@/theme/tokens'

export const BRAND = {
  company: 'Prodigy',
  product: 'PM Academy',
  fullName: 'Prodigy PM Academy',
  shortName: 'PM Academy',
  tagline: 'The Duolingo of Product Management.',
  positioning: '90 lessons. 9 modules. Free forever.',
  domain: 'pmacademy.adityagangwani.me',
  social: {
    linkedin: 'https://linkedin.com/company/pmacademy',
    twitter: 'https://x.com/pmacademy_app',
    buyMeACoffee: 'https://buymeacoffee.com/pmacademy',
  },
  legalEntity: 'Prodigy',
  certificateIssuer: 'Prodigy',
  adminName: 'Prodigy PM Academy Admin',
  // Canonical site URL — always read from NEXT_PUBLIC_SITE_URL env var in runtime code.
  // This value is the production default for any server-side context where env is available.
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://pmacademy.adityagangwani.me',
  supportEmail: 'hello@pmacademy.adityagangwani.me',
  emailFromName: 'Prodigy PM Academy',
  emailFromAddress: 'welcome@pmacademy.com',
  certificateIssuerLine: 'Issued by Prodigy · PM Academy',
  certificateCodePrefix: 'PMA',
  learnerFallbackName: 'PM Academy Learner',
  colors: {
    primary: TOKENS.colors.primary,
    foreground: TOKENS.colors.foreground,
    background: TOKENS.colors.background,
  },
  metadata: {
    homeTitle: 'Prodigy PM Academy — Learn Product Management Free',
    titleTemplate: '%s | Prodigy PM Academy',
    description:
      'A complete, free Product Management curriculum with 90 structured lessons, interactive quizzes, skill analytics, and portfolio projects. Built for career switchers and ambitious builders.',
    shortDescription: '90 lessons. 9 modules. One skill: product judgment. Completely free.',
  },
  assets: {
    dir: '/brand',
    logoMark: '/brand/logo-mark.svg',
    logoFull: '/brand/logo-full.svg',
    logoFullSvg: '/brand/logo-full.svg',
    logoMarkSvg: '/brand/logo-mark.svg',
    logoMarkOnDark: '/brand/logo-mark-on-dark.svg',
    wordmarkSvg: '/brand/wordmark.svg',
    logoFullPng: '/brand/logo-full.png',
    logoMarkPng: '/brand/logo-mark.png',
    favicon: '/favicon.ico',
    faviconSvg: '/favicon.svg',
    appleTouchIcon: '/apple-touch-icon.png',
    safariPinnedTab: '/brand/safari-pinned-tab.svg',
    ogImage: '/brand/og-image.png',
    logoFullDimensions: { width: 800, height: 200 },
    logoMarkDimensions: { width: 423, height: 498 },
    wordmarkDimensions: { width: 600, height: 200 },
    ogImageDimensions: { width: 1200, height: 630 },
  },
} as const

export type Brand = typeof BRAND

export function brandTitle(title?: string) {
  return title ? `${title} | ${BRAND.fullName}` : BRAND.metadata.homeTitle
}

export function productCopy(text: string) {
  return text.replaceAll('{product}', BRAND.product).replaceAll('{fullName}', BRAND.fullName)
}
