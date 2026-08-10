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
          backgroundColor: isPrimary ? '#1F6B4E' : '#F2EFE7',
          color: isPrimary ? '#FFFFFF' : '#171A17',
          padding: '12px 24px',
          borderRadius: '8px',
          textDecoration: 'none',
          fontWeight: 700,
          fontSize: '14px',
          textAlign: 'center',
          boxShadow: isPrimary ? '0 2px 4px rgba(31, 107, 78, 0.2)' : 'none',
          border: isPrimary ? 'none' : '1px solid #DED8CB',
        }}
      >
        {children}
      </a>
    </div>
  )
}
