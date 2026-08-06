import React from 'react'
import { EmailWrapper } from '../../components/EmailWrapper'
import { Button } from '../../components/Button'
import { BRAND } from '@/lib/brand'

export interface VerifyEmailProps {
  userName?: string
  verificationUrl?: string
}

export const VerifyEmail: React.FC<VerifyEmailProps> = ({
  userName = 'Learner',
  verificationUrl = `${BRAND.siteUrl}/auth/callback`,
}) => {
  return (
    <EmailWrapper previewText="Confirm your PM Academy email address.">
      <h2 style={{ fontSize: '20px', color: '#1a1a1a', marginTop: 0 }}>Confirm your email address</h2>
      <p style={{ fontSize: '14px', color: '#525252' }}>
        Hi {userName}, please confirm your email address to secure your account and track your PM Academy progress.
      </p>
      <Button href={verificationUrl}>Verify Email Address</Button>
      <p style={{ fontSize: '12px', color: '#737373', marginTop: '16px' }}>
        If you did not request this account, you can safely ignore this email.
      </p>
    </EmailWrapper>
  )
}
