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
    <EmailWrapper previewText="Confirm your Prodily email address." isCriticalAuth={true}>
      <h2 style={{ fontSize: '20px', color: '#171A17', marginTop: 0, fontWeight: 700 }}>Confirm your email address</h2>
      <p style={{ fontSize: '14px', color: '#70685A' }}>
        Hi {userName}, please confirm your email address to secure your account and start your Prodily learning path.
      </p>
      <Button href={verificationUrl}>Verify Email Address</Button>
      <p style={{ fontSize: '12px', color: '#9EA59D', marginTop: '20px' }}>
        If you did not request this account, you can safely ignore this email.
      </p>
    </EmailWrapper>
  )
}
