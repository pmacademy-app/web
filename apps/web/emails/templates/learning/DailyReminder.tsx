import React from 'react'
import { EmailWrapper } from '../../components/EmailWrapper'
import { Button } from '../../components/Button'
import { BRAND } from '@/lib/brand'
import { StatCard } from '../../components/StatCard'

export interface DailyReminderProps {
  userName?: string
  currentStreak?: number
  dueCount?: number
  appUrl?: string
  unsubscribeToken?: string
}

export const DailyReminder: React.FC<DailyReminderProps> = ({
  userName = 'Learner',
  currentStreak = 1,
  dueCount = 5,
  appUrl = BRAND.siteUrl,
  unsubscribeToken,
}) => {
  return (
    <EmailWrapper previewText={`Daily Reminder: Keep your ${currentStreak}-day streak alive!`} unsubscribeToken={unsubscribeToken}>
      <h2 style={{ fontSize: '20px', color: '#1a1a1a', marginTop: 0 }}>Daily Learning &amp; Review Reminder 🔥</h2>
      <p style={{ fontSize: '14px', color: '#525252' }}>
        Hi {userName}, your daily flashcard reviews and learning streak are waiting for you today.
      </p>

      <table role="presentation" width="100%" border={0} cellPadding={0} cellSpacing={0}>
        <tr>
          <td width="50%" style={{ paddingRight: '6px' }}>
            <StatCard label="Current Streak" value={`${currentStreak} Days 🔥`} />
          </td>
          <td width="50%" style={{ paddingLeft: '6px' }}>
            <StatCard label="Cards Due" value={dueCount} />
          </td>
        </tr>
      </table>

      <p style={{ fontSize: '14px', color: '#525252', marginTop: '16px' }}>
        Spend just 5 minutes today to solidify your product management knowledge and preserve your streak!
      </p>

      <Button href={`${appUrl}/review`}>Start Daily Review</Button>
    </EmailWrapper>
  )
}
