import React from 'react'
import { EmailWrapper } from '../../components/EmailWrapper'
import { Button } from '../../components/Button'
import { BRAND } from '@/lib/brand'
import { StatCard } from '../../components/StatCard'

export interface LevelUpEmailProps {
  userName?: string
  newLevel?: number
  levelTitle?: string
  totalXp?: number
  appUrl?: string
  unsubscribeToken?: string
}

export const LevelUpEmail: React.FC<LevelUpEmailProps> = ({
  userName = 'Learner',
  newLevel = 2,
  levelTitle = 'Associate Product Manager',
  totalXp = 500,
  appUrl = BRAND.siteUrl,
  unsubscribeToken,
}) => {
  return (
    <EmailWrapper previewText={`You unlocked Level ${newLevel}: ${levelTitle}!`} unsubscribeToken={unsubscribeToken}>
      <h2 style={{ fontSize: '20px', color: '#171A17', marginTop: 0, fontWeight: 700 }}>Level Up Unlocked! 🚀</h2>
      <p style={{ fontSize: '14px', color: '#70685A' }}>
        Congratulations, {userName}! Your consistency has pushed your total XP to <strong>{totalXp} XP</strong> and unlocked a new career rank in Prodily PM Academy.
      </p>

      <StatCard label={`Level ${newLevel}`} value={levelTitle} subtitle={`${totalXp} Cumulative XP`} />

      <p style={{ fontSize: '14px', color: '#70685A', marginTop: '16px' }}>
        Keep advancing your Product Management skills and unlocking higher competency ranks!
      </p>

      <Button href={`${appUrl}/progress`}>View Progress &amp; Skill Radar</Button>
    </EmailWrapper>
  )
}
