import React from 'react'
import { EmailWrapper } from '../../components/EmailWrapper'
import { Button } from '../../components/Button'
import { BRAND } from '@/lib/brand'

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
  verificationUrl = `${BRAND.siteUrl}/verify/PMA-2026-X8K9L2`,
  unsubscribeToken,
}) => {
  return (
    <EmailWrapper previewText="Your official Prodily Certificate is ready!" unsubscribeToken={unsubscribeToken}>
      <h2 style={{ fontSize: '20px', color: '#171A17', marginTop: 0, fontWeight: 700 }}>Certificate Issued! 🎓</h2>
      <p style={{ fontSize: '14px', color: '#70685A' }}>
        Congratulations, {userName}! You have earned your official Prodily Credential.
      </p>

      <div
        style={{
          backgroundColor: '#FBFAF6',
          border: '1px solid #DED8CB',
          borderRadius: '10px',
          padding: '20px',
          margin: '20px 0',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '11px', color: '#70685A', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>
          Credential ID
        </div>
        <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#1F6B4E', margin: '6px 0', fontFamily: 'monospace' }}>
          {certificateCode}
        </div>
      </div>

      <p style={{ fontSize: '14px', color: '#70685A' }}>
        Your certificate includes verifiable Schema.org metadata and can be shared on LinkedIn or embedded on your public portfolio.
      </p>

      <Button href={verificationUrl}>View &amp; Download Certificate</Button>
    </EmailWrapper>
  )
}
