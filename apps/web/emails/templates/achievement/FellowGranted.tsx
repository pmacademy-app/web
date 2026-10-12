import React from 'react'
import { EmailWrapper } from '../../components/EmailWrapper'
import { Button } from '../../components/Button'
import { BRAND } from '@/lib/brand'

export interface FellowGrantedProps {
  userName?: string
  username?: string | null
  portfolioUrl?: string
  appUrl?: string
  unsubscribeToken?: string
}

export const FellowGranted: React.FC<FellowGrantedProps> = ({
  userName = 'Learner',
  portfolioUrl = `${BRAND.siteUrl}/p/pm-learner`,
  unsubscribeToken,
}) => {
  return (
    <EmailWrapper previewText={`You're now a ${BRAND.company} PM Fellow!`} unsubscribeToken={unsubscribeToken}>
      <h2 style={{ fontSize: '20px', color: '#171A17', marginTop: 0, fontWeight: 700 }}>
        You&apos;re now a {BRAND.company} PM Fellow 🎓
      </h2>
      <p style={{ fontSize: '14px', color: '#70685A' }}>
        Congratulations, {userName}! The {BRAND.company} team has granted you PM Fellow status.
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
        }}
      >
        <strong>What it means:</strong> PM Fellow is a distinction for learners with a complete, portfolio-ready
        profile. Your Fellow badge now shows on your public portfolio.
      </div>

      <p style={{ fontSize: '14px', color: '#70685A' }}>
        Share your portfolio with recruiters and hiring managers, or post the link on LinkedIn, so they can see your
        capstone work alongside your Fellow badge.
      </p>

      <Button href={portfolioUrl}>View your Fellow portfolio</Button>
    </EmailWrapper>
  )
}
