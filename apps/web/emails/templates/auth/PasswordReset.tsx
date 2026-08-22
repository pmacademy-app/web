import React from 'react'
import { EmailWrapper } from '../../components/EmailWrapper'
import { Button } from '../../components/Button'
import { BRAND } from '@/lib/brand'

export interface PasswordResetProps {
  userName?: string
  resetUrl?: string
}

export const PasswordReset: React.FC<PasswordResetProps> = ({
  userName = 'Learner',
  resetUrl = `${BRAND.siteUrl}/auth/reset-password`,
}) => {
  return (
    <EmailWrapper previewText="Reset your Prodily account password." isCriticalAuth={true}>
      <h2 style={{ fontSize: '20px', color: '#171A17', marginTop: 0, fontWeight: 700 }}>Reset your password</h2>
      <p style={{ fontSize: '14px', color: '#70685A' }}>
        Hi {userName}, we received a request to reset your password for your Prodily account.
      </p>
      <Button href={resetUrl}>Reset Password</Button>
      <p style={{ fontSize: '12px', color: '#9EA59D', marginTop: '20px' }}>
        This link is valid for 1 hour. If you did not request a password reset, please ignore this email.
      </p>
    </EmailWrapper>
  )
}
