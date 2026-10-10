import React from 'react'
import { EmailWrapper } from '../../components/EmailWrapper'
import { Button } from '../../components/Button'
import { BRAND } from '@/lib/brand'
import { StatCard } from '../../components/StatCard'

export interface WeeklyRecapProps {
  userName?: string
  lessonsCompletedThisWeek?: number
  xpEarnedThisWeek?: number
  currentStreak?: number
  daysStudiedThisWeek?: number
  /** Growth R5 B9: the single next step toward the learner's proof (from selectProofNextStep). */
  proofStepText?: string | null
  proofStepUrl?: string | null
  /** The live referral reward; null or absent hides the invite line. */
  referralRewardXp?: number | null
  appUrl?: string
  unsubscribeToken?: string
}

export const WeeklyRecap: React.FC<WeeklyRecapProps> = ({
  userName = 'Learner',
  // Zero, never a made-up number, when a value is missing.
  lessonsCompletedThisWeek = 0,
  xpEarnedThisWeek = 0,
  currentStreak = 0,
  daysStudiedThisWeek = 0,
  proofStepText = null,
  proofStepUrl = null,
  referralRewardXp = null,
  appUrl = BRAND.siteUrl,
  unsubscribeToken,
}) => {
  return (
    <EmailWrapper previewText={`Your weekly Prodily recap: ${lessonsCompletedThisWeek} lessons, ${xpEarnedThisWeek} XP!`} unsubscribeToken={unsubscribeToken}>
      <h2 style={{ fontSize: '20px', color: '#171A17', marginTop: 0, fontWeight: 700 }}>Your Weekly Progress Recap 📊</h2>
      <p style={{ fontSize: '14px', color: '#70685A' }}>
        Hi {userName}, here is a look at your learning progress in Prodily over the past week:
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

      {proofStepText && proofStepUrl ? (
        <p style={{ fontSize: '14px', color: '#171A17', marginTop: '16px' }}>
          <strong>Your next step:</strong> {proofStepText}{' '}
          <a href={proofStepUrl} style={{ color: '#1F6B4E', fontWeight: 600 }}>
            Take it now
          </a>
        </p>
      ) : (
        <p style={{ fontSize: '14px', color: '#70685A', marginTop: '16px' }}>
          Consistency is the secret to mastering Product Management. Keep building your daily learning habit!
        </p>
      )}

      {referralRewardXp ? (
        <p style={{ fontSize: '13px', color: '#70685A' }}>
          Know someone learning product management? Invite them and earn +{referralRewardXp} XP when they finish their
          first lesson.{' '}
          <a href={`${appUrl}/settings?tab=referrals`} style={{ color: '#1F6B4E', fontWeight: 600 }}>
            Get your invite link
          </a>
        </p>
      ) : null}

      <Button href={`${appUrl}/dashboard`}>Continue Learning</Button>
    </EmailWrapper>
  )
}
