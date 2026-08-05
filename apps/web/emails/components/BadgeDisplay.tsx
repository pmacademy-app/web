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
        backgroundColor: '#fffbe6',
        border: '1px solid #ffe58f',
        borderRadius: '12px',
        padding: '20px',
        textAlign: 'center',
        margin: '20px 0',
      }}
    >
      <div style={{ fontSize: '40px', marginBottom: '8px' }}>{badgeIcon}</div>
      <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#b45309' }}>
        {badgeName}
      </div>
      <div style={{ fontSize: '14px', color: '#78350f', marginTop: '4px' }}>
        {badgeDescription}
      </div>
    </div>
  )
}
