/**
 * Pure Certificate & Credential Utilities (Phase 3 Sprint 3)
 *
 * Provides certificate code generation, schema.org EducationalOccupationalCredential JSON-LD,
 * and pure vector SVG QR code matrix rendering for certificate verification.
 * Zero UI coupling.
 */

import { BRAND } from '@/lib/brand'

export interface CredentialJsonLdOptions {
  certificateCode: string
  learnerName: string
  careerTitle: string
  issuedAt: string
  verificationUrl: string
  portfolioUrl: string
  siteOrigin: string
}

/**
 * Generates a clean, unique certificate code (e.g., PMA-2026-8F2A7B9C).
 */
export function generateCertificateCode(
  userId: string,
  type: string = 'full_curriculum',
  moduleSlug?: string | null
): string {
  const year = new Date().getFullYear()
  const rawSeed = `${userId}-${type}-${moduleSlug || 'full'}`
  
  // Simple deterministic FNV-1a hash to 8 uppercase hex characters
  let hash = 2166136261
  for (let i = 0; i < rawSeed.length; i++) {
    hash ^= rawSeed.charCodeAt(i)
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)
  }
  
  const hexPart = (hash >>> 0).toString(16).padStart(8, '0').substring(0, 8).toUpperCase()
  return `${BRAND.certificateCodePrefix}-${year}-${hexPart}`
}

/**
 * Generates schema.org EducationalOccupationalCredential JSON-LD for verification page SEO.
 */
export function generateCredentialJsonLd({
  certificateCode,
  learnerName,
  careerTitle,
  issuedAt,
  verificationUrl,
  portfolioUrl,
}: CredentialJsonLdOptions): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'EducationalOccupationalCredential',
    name: `${BRAND.fullName} Product Management Completion Credential`,
    credentialCategory: 'Certificate of Completion',
    identifier: certificateCode,
    educationalLevel: careerTitle,
    dateCreated: issuedAt,
    url: verificationUrl,
    recognizedBy: {
      '@type': 'Organization',
      name: BRAND.fullName,
      url: BRAND.siteUrl,
    },
    grantee: {
      '@type': 'Person',
      name: learnerName,
      sameAs: portfolioUrl,
    },
  }
}

import QRCode from 'qrcode'

/**
 * Renders a clean pure vector SVG QR code matrix for a given URL using ISO/IEC 18004 compliant QRCode matrix.
 */
export function generateQrCodeSvg(url: string, size: number = 100): string {
  try {
    const qr = QRCode.create(url, { errorCorrectionLevel: 'M' })
    const sizeModules = qr.modules.size
    const data = qr.modules.data
    const rects: string[] = []

    for (let r = 0; r < sizeModules; r++) {
      for (let c = 0; c < sizeModules; c++) {
        if (data[r * sizeModules + c]) {
          rects.push(`<rect x="${c}" y="${r}" width="1" height="1" fill="currentColor" />`)
        }
      }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sizeModules} ${sizeModules}" width="${size}" height="${size}" class="w-full h-full text-foreground">${rects.join('')}</svg>`
  } catch (err) {
    console.error('[certificates] Error generating QR code SVG:', err)
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 21" width="${size}" height="${size}" class="w-full h-full text-foreground"><rect width="21" height="21" fill="currentColor" opacity="0.1"/></svg>`
  }
}
