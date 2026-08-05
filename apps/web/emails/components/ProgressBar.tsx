import React from 'react'

export interface ProgressBarProps {
  progressPercent: number
  label?: string
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ progressPercent, label }) => {
  const percent = Math.min(100, Math.max(0, progressPercent))

  return (
    <div style={{ margin: '16px 0' }}>
      {label && (
        <div style={{ fontSize: '12px', color: '#525252', marginBottom: '6px', fontWeight: 500 }}>
          {label} ({percent}%)
        </div>
      )}
      <div
        style={{
          width: '100%',
          height: '10px',
          backgroundColor: '#e5e5e5',
          borderRadius: '5px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${percent}%`,
            height: '100%',
            backgroundColor: '#d97706',
            borderRadius: '5px',
          }}
        />
      </div>
    </div>
  )
}
