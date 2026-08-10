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
    <EmailWrapper previewText={`Daily Reminder: Keep your ${currentStreak}-day streak alive on Prodily PM Academy!`} unsubscribeToken={unsubscribeToken}>
      <h2 style={{ fontSize: '20px', color: '#171A17', marginTop: 0, fontWeight: 700 }}>Daily Learning &amp; Review Reminder 🔥</h2>
      <p style={{ fontSize: '14px', color: '#70685A' }}>
        Hi {userName}, your daily flashcard reviews and learning streak are waiting for you today in Prodily PM Academy.
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

      <p style={{ fontSize: '14px', color: '#70685A', marginTop: '16px' }}>
        Spend just 5 minutes today to solidify your product management knowledge and preserve your learning streak!
      </p>

      <Button href={`${appUrl}/review`}>Start Daily Review</Button>
    </EmailWrapper>
  )
}
