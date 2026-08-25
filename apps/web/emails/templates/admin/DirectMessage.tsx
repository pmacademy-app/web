import React from 'react'
import { EmailWrapper } from '../../components/EmailWrapper'
import { Button } from '../../components/Button'
import { BRAND } from '@/lib/brand'

export interface DirectMessageEmailProps {
  userName?: string
  subject?: string
  messageBody?: string
  actionLabel?: string
  actionUrl?: string
  unsubscribeToken?: string
}

export const DirectMessageEmail: React.FC<DirectMessageEmailProps> = ({
  userName = 'Learner',
  subject = 'Message from the Prodily Team',
  messageBody = '',
  actionLabel,
  actionUrl,
  unsubscribeToken,
}) => {
  // Convert newlines in messageBody to paragraphs
  const paragraphs = messageBody
    ? messageBody.split(/\n\n+/).map((p) => p.trim()).filter(Boolean)
    : []

  return (
    <EmailWrapper previewText={subject} unsubscribeToken={unsubscribeToken}>
      <h2 style={{ fontSize: '20px', color: '#171A17', marginTop: 0, fontWeight: 700 }}>
        Hello {userName},
      </h2>

      {paragraphs.length > 0 ? (
        paragraphs.map((p, idx) => (
          <p key={idx} style={{ fontSize: '14px', color: '#70685A', lineHeight: 1.6, margin: '0 0 16px 0' }}>
            {p}
          </p>
        ))
      ) : (
        <p style={{ fontSize: '14px', color: '#70685A', lineHeight: 1.6, margin: '0 0 16px 0' }}>
          {messageBody}
        </p>
      )}

      {actionLabel && actionUrl && (
        <div style={{ marginTop: '24px' }}>
          <Button href={actionUrl}>{actionLabel}</Button>
        </div>
      )}

      <p style={{ fontSize: '13px', color: '#9EA59D', marginTop: '24px', borderTop: '1px solid #E6E1D6', paddingTop: '16px' }}>
        Best regards,<br />
        <strong>The {BRAND.shortName} Team</strong>
      </p>
    </EmailWrapper>
  )
}
