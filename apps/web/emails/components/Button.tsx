import React from 'react'

export interface ButtonProps {
  href: string
  children: React.ReactNode
  variant?: 'primary' | 'secondary'
}

export const Button: React.FC<ButtonProps> = ({ href, children, variant = 'primary' }) => {
  const isPrimary = variant === 'primary'

  return (
    <div style={{ marginTop: '24px', marginBottom: '16px' }}>
      <a
        href={href}
        style={{
          display: 'inline-block',
          backgroundColor: isPrimary ? '#d97706' : '#f3f4f6',
          color: isPrimary ? '#ffffff' : '#1f2937',
          padding: '12px 24px',
          borderRadius: '8px',
          textDecoration: 'none',
          fontWeight: 600,
          fontSize: '14px',
          textAlign: 'center',
          boxShadow: isPrimary ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
          border: isPrimary ? 'none' : '1px solid #e5e7eb',
        }}
      >
        {children}
      </a>
    </div>
  )
}
