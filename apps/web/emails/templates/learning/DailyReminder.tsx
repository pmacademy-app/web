import React from 'react'
import { EmailWrapper } from '../../components/EmailWrapper'
import { Button } from '../../components/Button'
import { BRAND } from '@/lib/brand'
import { StatCard } from '../../components/StatCard'

export interface DailyReminderProps {
  userName?: string
  /** Effective streak in the learner's timezone (0 once it has broken), not the stored column. */
  currentStreak?: number
  /** Longest streak ever; above 0 with a current streak of 0 means the learner is restarting. */
  longestStreak?: number
  dueCount?: number
  appUrl?: string
  unsubscribeToken?: string
}

export const DailyReminder: React.FC<DailyReminderProps> = ({
  userName = 'Learner',
  currentStreak = 0,
  longestStreak = 0,
  dueCount = 5,
  appUrl = BRAND.siteUrl,
  unsubscribeToken,
}) => {
  // PROD-05: never "keep your 0-day streak alive". With no live streak the copy invites the
  // learner to start (never had one) or restart (had one that broke).
  const hasStreak = currentStreak > 0
  const isRestart = !hasStreak && longestStreak > 0

  const previewText = hasStreak
    ? `Keep your ${currentStreak}-day streak going on ${BRAND.shortName}`
    : isRestart
      ? `Restart your streak on ${BRAND.shortName} today`
      : `Start your first streak on ${BRAND.shortName} today`

  const intro = hasStreak
    ? `Hi ${userName}, your flashcard reviews are waiting, and a session today keeps your ${currentStreak}-day streak going.`
    : isRestart
      ? `Hi ${userName}, your streak has reset, but your flashcard reviews are still here. One session today starts a new streak.`
      : `Hi ${userName}, your flashcard reviews are waiting. One session today starts your first streak.`

  const closing = hasStreak
    ? 'A short review today keeps your product management knowledge fresh and your streak alive.'
    : 'A short review today keeps your product management knowledge fresh and gets a new streak going.'

  return (
    <EmailWrapper previewText={previewText} unsubscribeToken={unsubscribeToken}>
      <h2 style={{ fontSize: '20px', color: '#171A17', marginTop: 0, fontWeight: 700 }}>Daily Learning &amp; Review Reminder</h2>
      <p style={{ fontSize: '14px', color: '#70685A' }}>{intro}</p>

      <table role="presentation" width="100%" border={0} cellPadding={0} cellSpacing={0}>
        <tr>
          <td width="50%" style={{ paddingRight: '6px' }}>
            <StatCard label="Current Streak" value={hasStreak ? `${currentStreak} ${currentStreak === 1 ? 'Day' : 'Days'} 🔥` : 'Start today'} />
          </td>
          <td width="50%" style={{ paddingLeft: '6px' }}>
            <StatCard label="Cards Due" value={dueCount} />
          </td>
        </tr>
      </table>

      <p style={{ fontSize: '14px', color: '#70685A', marginTop: '16px' }}>{closing}</p>

      <Button href={`${appUrl}/review`}>{hasStreak ? 'Start Daily Review' : 'Start Review'}</Button>
    </EmailWrapper>
  )
}
