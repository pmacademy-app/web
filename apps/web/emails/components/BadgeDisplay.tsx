import React from 'react'

export interface BadgeDisplayProps {
  badgeName: string
  badgeDescription: string
  badgeIcon?: string
}

export const BadgeDisplay: React.FC<BadgeDisplayProps> = ({
  badgeName,
  badgeDescription,
  badgeIcon = '🏅',
}) => {
  return (
    <div
      style={{
        backgroundColor: '#FBFAF6',
        border: '1px solid #DED8CB',
        borderRadius: '12px',
        padding: '24px 20px',
        textAlign: 'center',
        margin: '20px 0',
      }}
    >
      <div style={{ fontSize: '40px', marginBottom: '8px' }}>{badgeIcon}</div>
      <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#1F6B4E' }}>
        {badgeName}
      </div>
      <div style={{ fontSize: '14px', color: '#70685A', marginTop: '4px' }}>
        {badgeDescription}
      </div>
    </div>
  )
}
