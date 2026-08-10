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
        backgroundColor: '#FBFAF6',
        border: '1px solid #DED8CB',
        borderRadius: '10px',
        padding: '16px',
        textAlign: 'center',
        margin: '8px 0',
      }}
    >
      <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#70685A', fontWeight: 700, letterSpacing: '0.5px' }}>
        {label}
      </div>
      <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1F6B4E', margin: '4px 0' }}>
        {value}
      </div>
      {subtitle && <div style={{ fontSize: '12px', color: '#70685A' }}>{subtitle}</div>}
    </div>
  )
}
