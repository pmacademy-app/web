import React from 'react'
import { EmailWrapper } from '../../components/EmailWrapper'
import { Button } from '../../components/Button'

export interface CertificateEarnedProps {
  userName?: string
  certificateCode?: string
  verificationUrl?: string
  appUrl?: string
  unsubscribeToken?: string
}

export const CertificateEarned: React.FC<CertificateEarnedProps> = ({
  userName = 'Learner',
  certificateCode = 'PMA-2026-X8K9L2',
  verificationUrl = 'https://pmacademy.com/verify/PMA-2026-X8K9L2',
  unsubscribeToken,
}) => {
  return (
    <EmailWrapper previewText="Your official PM Academy Certificate is ready!" unsubscribeToken={unsubscribeToken}>
      <h2 style={{ fontSize: '20px', color: '#1a1a1a', marginTop: 0 }}>Certificate Issued! 🎓</h2>
      <p style={{ fontSize: '14px', color: '#525252' }}>
        Congratulations, {userName}! You have earned your official PM Academy Credential.
      </p>

      <div
        style={{
          backgroundColor: '#f8fafc',
          border: '1px solid #cbd5e1',
          borderRadius: '8px',
          padding: '16px',
          margin: '16px 0',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
          Credential ID
        </div>
        <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#0f172a', margin: '4px 0', fontFamily: 'monospace' }}>
          {certificateCode}
        </div>
      </div>

      <p style={{ fontSize: '14px', color: '#525252' }}>
        Your certificate includes verifiable Schema.org metadata and can be shared on LinkedIn or embedded on your public portfolio.
      </p>

      <Button href={verificationUrl}>View & Download Certificate</Button>
    </EmailWrapper>
  )
}
