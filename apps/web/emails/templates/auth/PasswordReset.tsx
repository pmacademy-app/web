import React from 'react'
import { EmailWrapper } from '../../components/EmailWrapper'
import { Button } from '../../components/Button'

export interface PasswordResetProps {
  userName?: string
  resetUrl?: string
}

export const PasswordReset: React.FC<PasswordResetProps> = ({
  userName = 'Learner',
  resetUrl = 'https://pmacademy.com/auth/reset-password',
}) => {
  return (
    <EmailWrapper previewText="Reset your PM Academy account password.">
      <h2 style={{ fontSize: '20px', color: '#1a1a1a', marginTop: 0 }}>Reset your password</h2>
      <p style={{ fontSize: '14px', color: '#525252' }}>
        Hi {userName}, we received a request to reset your password for your PM Academy account.
      </p>
      <Button href={resetUrl}>Reset Password</Button>
      <p style={{ fontSize: '12px', color: '#737373', marginTop: '16px' }}>
        This link is valid for 1 hour. If you did not request a password reset, please ignore this email or contact support if you have concerns.
      </p>
    </EmailWrapper>
  )
}
