import React from 'react'
import { EmailWrapper } from '../../components/EmailWrapper'
import { Button } from '../../components/Button'
import { BRAND } from '@/lib/brand'
import { BadgeDisplay } from '../../components/BadgeDisplay'
import { badgeShareText, buildPortfolioShareIntents } from '@/lib/portfolio'

export interface BadgeEarnedEmailProps {
  userName?: string
  badgeName?: string
  badgeDescription?: string
  badgeIcon?: string
  /** The learner's public portfolio; null or absent when it is private (no share links). */
  portfolioUrl?: string | null
  appUrl?: string
  unsubscribeToken?: string
}

/** UTM campaign on links shared from this email (Growth R5 B4). */
export const BADGE_EARNED_SHARE_CAMPAIGN = 'badge_earned_email'

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

export const BadgeEarnedEmail: React.FC<BadgeEarnedEmailProps> = ({
  userName = 'Learner',
  badgeName = 'First Step',
  badgeDescription = 'Completed your very first Prodily lesson',
  badgeIcon = '🏅',
  portfolioUrl = null,
  appUrl = BRAND.siteUrl,
  unsubscribeToken,
}) => {
  const intents = portfolioUrl
    ? buildPortfolioShareIntents(portfolioUrl, badgeShareText(badgeName, BRAND.fullName), BADGE_EARNED_SHARE_CAMPAIGN)
    : null

  return (
    <EmailWrapper previewText={`Congratulations! You earned the "${badgeName}" badge.`} unsubscribeToken={unsubscribeToken}>
      <h2 style={{ fontSize: '20px', color: '#171A17', marginTop: 0, fontWeight: 700 }}>New Badge Unlocked! 🎉</h2>
      <p style={{ fontSize: '14px', color: '#70685A' }}>
        Awesome work, {userName}! You&apos;ve reached a new achievement milestone in Prodily.
      </p>

      <BadgeDisplay badgeName={badgeName} badgeDescription={badgeDescription} badgeIcon={badgeIcon} />

      {intents ? (
        <>
          <p style={{ fontSize: '14px', color: '#70685A', marginBottom: '8px' }}>
            Your new badge is on your public portfolio. Share it in one click:
          </p>
          <p style={{ margin: '0 0 20px' }}>
            <a href={intents.linkedin} style={shareLinkStyle}>
              Share on LinkedIn
            </a>
            <a href={intents.x} style={shareLinkStyle}>
              Share on X
            </a>
          </p>
        </>
      ) : (
        <p style={{ fontSize: '14px', color: '#70685A' }}>
          Your new badge is in your achievement gallery. Make your portfolio public to show it to recruiters and peers.
        </p>
      )}

      <Button href={`${appUrl}/badges`}>View Your Badges</Button>
    </EmailWrapper>
  )
}
