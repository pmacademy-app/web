import React from 'react'
import { EmailWrapper } from '../../components/EmailWrapper'
import { Button } from '../../components/Button'
import { BRAND } from '@/lib/brand'
import { getCapstoneHref } from '@/config/capstones'

export interface CapstoneReviewedEmailProps {
  userName?: string
  moduleName?: string
  moduleSlug?: string
  action?: 'approve' | 'reject' | 'request_changes'
  feedback?: string
  appUrl?: string
  unsubscribeToken?: string
}

export const CapstoneReviewedEmail: React.FC<CapstoneReviewedEmailProps> = ({
  userName = 'Learner',
  moduleName = 'Product Management Capstone',
  moduleSlug = 'foundations',
  action = 'approve',
  feedback,
  appUrl = BRAND.siteUrl,
  unsubscribeToken,
}) => {
  const isApproved = action === 'approve'
  const isChangesRequested = action === 'request_changes'
  const title = isApproved
    ? 'Capstone Approved!'
    : isChangesRequested
      ? 'Capstone Feedback: Changes Requested'
      : 'Capstone Review Update'

  const previewText = `Your capstone review for ${moduleName} is ready.`

  return (
    <EmailWrapper previewText={previewText} unsubscribeToken={unsubscribeToken}>
      <h2 style={{ fontSize: '20px', color: '#171A17', marginTop: 0, fontWeight: 700 }}>{title}</h2>
      <p style={{ fontSize: '14px', color: '#70685A' }}>
        Hello {userName}, your submission for <strong>{moduleName}</strong> has been reviewed.
      </p>
      {feedback && (
        <div style={{ backgroundColor: '#F9F8F6', borderLeft: '4px solid #15803D', padding: '12px 16px', margin: '16px 0', fontSize: '14px', color: '#171A17' }}>
          <p style={{ margin: 0, fontStyle: 'italic' }}>&quot;{feedback}&quot;</p>
        </div>
      )}
      <p style={{ fontSize: '14px', color: '#70685A' }}>
        {isApproved
          ? 'Congratulations! Your capstone has been approved and published to your public portfolio.'
          : 'Please review the detailed rubric scores and feedback to revise and resubmit your project.'}
      </p>
      <Button href={`${appUrl}${getCapstoneHref(moduleSlug)}`}>View Capstone Review</Button>
    </EmailWrapper>
  )
}
