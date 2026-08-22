import React from 'react'
import { EmailWrapper } from '../../components/EmailWrapper'
import { Button } from '../../components/Button'
import { BRAND } from '@/lib/brand'
import { BadgeDisplay } from '../../components/BadgeDisplay'

export interface BadgeEarnedEmailProps {
  userName?: string
  badgeName?: string
  badgeDescription?: string
  badgeIcon?: string
  appUrl?: string
  unsubscribeToken?: string
}

export const BadgeEarnedEmail: React.FC<BadgeEarnedEmailProps> = ({
  userName = 'Learner',
  badgeName = 'First Step',
  badgeDescription = 'Completed your very first Prodily lesson',
  badgeIcon = '🏅',
  appUrl = BRAND.siteUrl,
  unsubscribeToken,
}) => {
  return (
    <EmailWrapper previewText={`Congratulations! You earned the "${badgeName}" badge.`} unsubscribeToken={unsubscribeToken}>
      <h2 style={{ fontSize: '20px', color: '#171A17', marginTop: 0, fontWeight: 700 }}>New Badge Unlocked! 🎉</h2>
      <p style={{ fontSize: '14px', color: '#70685A' }}>
        Awesome work, {userName}! You&apos;ve reached a new achievement milestone in Prodily.
      </p>

      <BadgeDisplay badgeName={badgeName} badgeDescription={badgeDescription} badgeIcon={badgeIcon} />

      <p style={{ fontSize: '14px', color: '#70685A' }}>
        Your new badge is now visible on your public portfolio and achievement gallery.
      </p>

      <Button href={`${appUrl}/badges`}>View Your Badges</Button>
    </EmailWrapper>
  )
}
