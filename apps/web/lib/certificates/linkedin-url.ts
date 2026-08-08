import { BRAND } from '@/lib/brand'

export interface LinkedInCertOptions {
  certificateCode: string
  careerTitle?: string
  type?: string
  issuedAt?: string | Date
  verificationUrl: string
}

/**
 * Builds a pure, unit-testable LinkedIn "Add to Profile" URL.
 * URL parameters conform to LinkedIn's official certification add interface.
 *
 * @param options Certificate options including code, title, issue date, and verification URL.
 * @returns Encoded LinkedIn add-to-profile URL string.
 */
export function buildLinkedInCertificationUrl({
  certificateCode,
  careerTitle,
  type = 'full_curriculum',
  issuedAt,
  verificationUrl,
}: LinkedInCertOptions): string {
  const name =
    type === 'full_curriculum'
      ? `${BRAND.fullName} — Product Management Certificate (${careerTitle || 'Graduate'})`
      : `${BRAND.fullName} — Module Completion Credential`

  const dateObj = issuedAt ? new Date(issuedAt) : new Date()
  const year = dateObj.getFullYear()
  const month = dateObj.getMonth() + 1 // 1-indexed (1-12)

  const baseUrl = 'https://www.linkedin.com/profile/add'
  const params = new URLSearchParams({
    startTask: 'CERTIFICATION_NAME',
    name,
    organizationName: BRAND.company, // "Prodigy"
    issueYear: String(year),
    issueMonth: String(month),
    certId: certificateCode,
    certUrl: verificationUrl,
  })

  return `${baseUrl}?${params.toString()}`
}
