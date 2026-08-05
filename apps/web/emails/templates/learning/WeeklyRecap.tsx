import React from 'react'
import { EmailWrapper } from '../../components/EmailWrapper'
import { Button } from '../../components/Button'
import { StatCard } from '../../components/StatCard'

export interface WeeklyRecapProps {
  userName?: string
  lessonsCompletedThisWeek?: number
  xpEarnedThisWeek?: number
  currentStreak?: number
  daysStudiedThisWeek?: number
  appUrl?: string
  unsubscribeToken?: string
}

export const WeeklyRecap: React.FC<WeeklyRecapProps> = ({
  userName = 'Learner',
  lessonsCompletedThisWeek = 5,
  xpEarnedThisWeek = 250,
  currentStreak = 7,
  daysStudiedThisWeek = 5,
  appUrl = 'https://pmacademy.com',
  unsubscribeToken,
}) => {
  return (
    <EmailWrapper previewText={`Your weekly PM Academy recap: ${lessonsCompletedThisWeek} lessons, ${xpEarnedThisWeek} XP!`} unsubscribeToken={unsubscribeToken}>
      <h2 style={{ fontSize: '20px', color: '#1a1a1a', marginTop: 0 }}>Your Weekly Progress Recap 📊</h2>
      <p style={{ fontSize: '14px', color: '#525252' }}>
        Hi {userName}, here is a look at your PM learning progress over the past week:
      </p>

      <table role="presentation" width="100%" border={0} cellPadding={0} cellSpacing={0}>
        <tr>
          <td width="50%" style={{ paddingRight: '6px' }}>
            <StatCard label="Lessons Completed" value={lessonsCompletedThisWeek} />
          </td>
          <td width="50%" style={{ paddingLeft: '6px' }}>
            <StatCard label="XP Earned" value={`+${xpEarnedThisWeek}`} />
          </td>
        </tr>
        <tr>
          <td width="50%" style={{ paddingRight: '6px' }}>
            <StatCard label="Current Streak" value={`${currentStreak} Days 🔥`} />
          </td>
          <td width="50%" style={{ paddingLeft: '6px' }}>
            <StatCard label="Days Studied" value={`${daysStudiedThisWeek} / 7`} />
          </td>
        </tr>
      </table>

      <p style={{ fontSize: '14px', color: '#525252', marginTop: '16px' }}>
        Consistency is the secret to mastering Product Management. Keep building your daily learning habit!
      </p>

      <Button href={`${appUrl}/dashboard`}>Continue Learning</Button>
    </EmailWrapper>
  )
}
