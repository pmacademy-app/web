import React from 'react'
import { EmailWrapper } from '../../components/EmailWrapper'
import { Button } from '../../components/Button'
import { BRAND } from '@/lib/brand'
import { buildPortfolioShareIntents, portfolioShareText } from '@/lib/portfolio'

export interface PortfolioPublishedProps {
  userName?: string
  portfolioUrl?: string
  appUrl?: string
  unsubscribeToken?: string
}

/** UTM campaign on links shared from this email (Growth R5 B3). */
export const PORTFOLIO_PUBLISHED_SHARE_CAMPAIGN = 'portfolio_published_email'

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

export const PortfolioPublished: React.FC<PortfolioPublishedProps> = ({
  userName = 'Learner',
  portfolioUrl = `${BRAND.siteUrl}/p/pm-learner`,
  unsubscribeToken,
}) => {
  // One click from the inbox: the same share text and link LinkedIn/X get from the portfolio page.
  const intents = buildPortfolioShareIntents(
    portfolioUrl,
    portfolioShareText(userName, BRAND.fullName),
    PORTFOLIO_PUBLISHED_SHARE_CAMPAIGN,
  )

  return (
    <EmailWrapper previewText="Your Prodily Public Portfolio is live!" unsubscribeToken={unsubscribeToken}>
      <h2 style={{ fontSize: '20px', color: '#171A17', marginTop: 0, fontWeight: 700 }}>Your Portfolio is Live! 🌐</h2>
      <p style={{ fontSize: '14px', color: '#70685A' }}>
        Hi {userName}, your public Prodily portfolio is active and accessible to hiring managers, peers, and recruiters.
      </p>

      <div
        style={{
          backgroundColor: '#FBFAF6',
          border: '1px solid #DED8CB',
          borderRadius: '10px',
          padding: '16px',
          margin: '20px 0',
          fontSize: '14px',
          color: '#171A17',
          wordBreak: 'break-all',
        }}
      >
        <strong>Portfolio URL:</strong> <a href={portfolioUrl} style={{ color: '#1F6B4E', fontWeight: 600 }}>{portfolioUrl}</a>
      </div>

      <p style={{ fontSize: '14px', color: '#70685A', marginBottom: '8px' }}>
        Share it in one click to showcase your capstone projects, earned badges, and Skill Radar competency:
      </p>
      <p style={{ margin: '0 0 20px' }}>
        <a href={intents.linkedin} style={shareLinkStyle}>
          Share on LinkedIn
        </a>
        <a href={intents.x} style={shareLinkStyle}>
          Share on X
        </a>
      </p>

      <Button href={portfolioUrl}>View Public Portfolio</Button>
    </EmailWrapper>
  )
}
