import React from 'react'
import { EmailWrapper } from '../../components/EmailWrapper'
import { Button } from '../../components/Button'
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
  appUrl = 'https://pmacademy.com',
  unsubscribeToken,
}) => {
  return (
    <EmailWrapper previewText={`You unlocked Level ${newLevel}: ${levelTitle}!`} unsubscribeToken={unsubscribeToken}>
      <h2 style={{ fontSize: '20px', color: '#1a1a1a', marginTop: 0 }}>Level Up Unlocked! 🚀</h2>
      <p style={{ fontSize: '14px', color: '#525252' }}>
        Congratulations, {userName}! Your dedication has pushed your total XP to <strong>{totalXp} XP</strong> and unlocked a new career milestone.
      </p>

      <StatCard label={`Level ${newLevel}`} value={levelTitle} subtitle={`${totalXp} Cumulative XP`} />

      <p style={{ fontSize: '14px', color: '#525252', marginTop: '16px' }}>
        Keep advancing your Product Management skills and unlocking higher competency ranks!
      </p>

      <Button href={`${appUrl}/progress`}>View Progress & Radar</Button>
    </EmailWrapper>
  )
}
