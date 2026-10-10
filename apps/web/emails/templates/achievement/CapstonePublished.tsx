import React from 'react'
import { EmailWrapper } from '../../components/EmailWrapper'
import { Button } from '../../components/Button'
import { BRAND } from '@/lib/brand'
import { buildPortfolioShareIntents, capstoneShareText, portfolioShareText } from '@/lib/portfolio'

export interface CapstonePublishedProps {
  userName?: string
  moduleTitle?: string
  /** The learner's public portfolio; null or absent when it is private (no share links). */
  portfolioUrl?: string | null
  /** The capstone's own public page (Growth R5 B13b); preferred over the portfolio when set. */
  casePageUrl?: string | null
  /** The capstone workspace, the fallback destination. */
  capstoneUrl?: string
  appUrl?: string
  unsubscribeToken?: string
}

/** UTM campaign on links shared from this email (Growth R5 B5). */
export const CAPSTONE_PUBLISHED_SHARE_CAMPAIGN = 'capstone_published_email'

const shareLinkStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '10px 16px',
  marginRight: '8px',
  marginBottom: '8px',
  borderRadius: '8px',
  border: '1px solid #DED8CB',
  backgroundColor: '#FFFFFF',
  color: '#171A17',
  fontSize: '13px',
  fontWeight: 600,
  textDecoration: 'none',
}

export const CapstonePublished: React.FC<CapstonePublishedProps> = ({
  userName = 'Learner',
  moduleTitle = 'your module',
  portfolioUrl = null,
  casePageUrl = null,
  capstoneUrl = `${BRAND.siteUrl}/capstones`,
  unsubscribeToken,
}) => {
  // Share the case study page when there is one, else the portfolio.
  const sharedUrl = casePageUrl || portfolioUrl
  const intents = sharedUrl
    ? buildPortfolioShareIntents(
        sharedUrl,
        casePageUrl
          ? capstoneShareText(userName, moduleTitle, BRAND.fullName)
          : portfolioShareText(userName, BRAND.fullName),
        CAPSTONE_PUBLISHED_SHARE_CAMPAIGN,
      )
    : null

  return (
    <EmailWrapper previewText={`Your ${moduleTitle} capstone is published`} unsubscribeToken={unsubscribeToken}>
      <h2 style={{ fontSize: '20px', color: '#171A17', marginTop: 0, fontWeight: 700 }}>Your capstone is published 🏆</h2>
      <p style={{ fontSize: '14px', color: '#70685A' }}>
        Great work, {userName}! The {BRAND.company} team reviewed your <strong>{moduleTitle}</strong> capstone and
        published it.
      </p>

      {intents ? (
        <>
          <p style={{ fontSize: '14px', color: '#70685A', marginBottom: '8px' }}>
            It is now on your public portfolio. Share it in one click:
          </p>
          <p style={{ margin: '0 0 20px' }}>
            <a href={intents.linkedin} style={shareLinkStyle}>
              Share on LinkedIn
            </a>
            <a href={intents.x} style={shareLinkStyle}>
              Share on X
            </a>
          </p>
          <Button href={casePageUrl || portfolioUrl!}>{casePageUrl ? 'View your case study' : 'View on your portfolio'}</Button>
        </>
      ) : (
        <>
          <p style={{ fontSize: '14px', color: '#70685A' }}>
            Make your portfolio public so recruiters and peers can see it.
          </p>
          <Button href={capstoneUrl}>View your capstone</Button>
        </>
      )}
    </EmailWrapper>
  )
}
