import React from 'react'
import { EmailWrapper } from '../../components/EmailWrapper'
import { Button } from '../../components/Button'
import { BRAND } from '@/lib/brand'
import { getCapstoneForModule, getCapstoneHref } from '@/config/capstones'

export interface ModuleCompletedEmailProps {
  userName?: string
  moduleName?: string
  moduleSlug?: string
  appUrl?: string
  unsubscribeToken?: string
}

export const ModuleCompletedEmail: React.FC<ModuleCompletedEmailProps> = ({
  userName = 'Learner',
  moduleName = 'Foundations of Product Management',
  moduleSlug = 'foundations',
  appUrl = BRAND.siteUrl,
  unsubscribeToken,
}) => {
  // "One capstone closer": name the module's real capstone (Growth R5 B8).
  const capstone = getCapstoneForModule(moduleSlug)
  return (
    <EmailWrapper previewText={`Congratulations on completing Module: ${moduleName}!`} unsubscribeToken={unsubscribeToken}>
      <h2 style={{ fontSize: '20px', color: '#171A17', marginTop: 0, fontWeight: 700 }}>Module Complete: {moduleName}! 🏆</h2>
      <p style={{ fontSize: '14px', color: '#70685A' }}>
        Fantastic effort, {userName}! You&apos;ve finished all lessons in <strong>{moduleName}</strong>.
      </p>
      <p style={{ fontSize: '14px', color: '#70685A', fontWeight: 600 }}>
        What&apos;s next?
      </p>
      <ul style={{ fontSize: '14px', color: '#70685A', paddingLeft: '20px', lineHeight: 1.8 }}>
        <li>
          <strong>{capstone ? capstone.title : 'Capstone Project'}</strong>:{' '}
          {capstone
            ? 'this module’s capstone is now one step closer. Submit it to add it to your portfolio.'
            : 'Apply what you learned to build a portfolio project.'}
        </li>
        <li><strong>Next Curriculum Module</strong>: Keep your momentum going into the next module.</li>
      </ul>
      <Button href={`${appUrl}${getCapstoneHref(moduleSlug)}`}>Start Capstone Project</Button>
    </EmailWrapper>
  )
}
