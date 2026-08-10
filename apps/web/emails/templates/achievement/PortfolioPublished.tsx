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
    <EmailWrapper previewText="Your Prodily PM Academy Public Portfolio is live!" unsubscribeToken={unsubscribeToken}>
      <h2 style={{ fontSize: '20px', color: '#171A17', marginTop: 0, fontWeight: 700 }}>Your Portfolio is Live! 🌐</h2>
      <p style={{ fontSize: '14px', color: '#70685A' }}>
        Hi {userName}, your public Prodily PM Academy portfolio is active and accessible to hiring managers, peers, and recruiters.
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

      <p style={{ fontSize: '14px', color: '#70685A' }}>
        Share your public portfolio link on LinkedIn, Twitter, or job applications to showcase your capstone projects, earned badges, and Skill Radar competency.
      </p>

      <Button href={portfolioUrl}>View Public Portfolio</Button>
    </EmailWrapper>
  )
}
