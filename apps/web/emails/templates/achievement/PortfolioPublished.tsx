import React from 'react'
import { EmailWrapper } from '../../components/EmailWrapper'
import { Button } from '../../components/Button'
import { BRAND } from '@/lib/brand'

export interface PortfolioPublishedProps {
  userName?: string
  portfolioUrl?: string
  appUrl?: string
  unsubscribeToken?: string
}

export const PortfolioPublished: React.FC<PortfolioPublishedProps> = ({
  userName = 'Learner',
  portfolioUrl = `${BRAND.siteUrl}/p/pm-learner`,
  unsubscribeToken,
}) => {
  return (
    <EmailWrapper previewText="Your PM Academy Public Portfolio is live!" unsubscribeToken={unsubscribeToken}>
      <h2 style={{ fontSize: '20px', color: '#1a1a1a', marginTop: 0 }}>Your Portfolio is Live! 🌐</h2>
      <p style={{ fontSize: '14px', color: '#525252' }}>
        Hi {userName}, your public PM Academy portfolio page is now active and accessible to recruiters and hiring managers.
      </p>

      <div
        style={{
          backgroundColor: '#f9fafb',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '16px',
          margin: '16px 0',
          fontSize: '14px',
          color: '#374151',
          wordBreak: 'break-all',
        }}
      >
        <strong>Portfolio Link:</strong> <a href={portfolioUrl} style={{ color: '#d97706' }}>{portfolioUrl}</a>
      </div>

      <p style={{ fontSize: '14px', color: '#525252' }}>
        Share your public portfolio link on LinkedIn, Twitter, or resume applications to highlight your completed capstone artifacts, badges, and skill radar competency.
      </p>

      <Button href={portfolioUrl}>View Public Portfolio</Button>
    </EmailWrapper>
  )
}
