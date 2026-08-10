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
          backgroundColor: '#F2EFE7',
          borderRadius: '5px',
          overflow: 'hidden',
          border: '1px solid #DED8CB',
        }}
      >
        <div
          style={{
            width: `${percent}%`,
            height: '100%',
            backgroundColor: '#1F6B4E',
            borderRadius: '5px',
          }}
        />
      </div>
    </div>
  )
}
