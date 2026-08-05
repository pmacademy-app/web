import React from 'react'

export interface StatCardProps {
  label: string
  value: string | number
  subtitle?: string
}

export const StatCard: React.FC<StatCardProps> = ({ label, value, subtitle }) => {
  return (
    <div
      style={{
        backgroundColor: '#fafafa',
        border: '1px solid #e5e5e5',
        borderRadius: '8px',
        padding: '16px',
        textAlign: 'center',
        margin: '8px 0',
      }}
    >
      <div style={{ fontSize: '12px', textTransform: 'uppercase', color: '#737373', fontWeight: 600, letterSpacing: '0.5px' }}>
        {label}
      </div>
      <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#d97706', margin: '4px 0' }}>
        {value}
      </div>
      {subtitle && <div style={{ fontSize: '12px', color: '#525252' }}>{subtitle}</div>}
    </div>
  )
}
