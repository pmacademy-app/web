/* eslint-disable @next/next/no-head-element */
import React from 'react'

export interface EmailWrapperProps {
  children: React.ReactNode
  previewText?: string
  unsubscribeToken?: string
}

export const EmailWrapper: React.FC<EmailWrapperProps> = ({
  children,
  previewText,
  unsubscribeToken,
}) => {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://pmacademy.com'
  const unsubscribeUrl = unsubscribeToken
    ? `${appUrl}/api/email/unsubscribe?token=${unsubscribeToken}`
    : `${appUrl}/settings?tab=notifications`

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>PM Academy</title>
        {previewText && (
          <div
            style={{
              display: 'none',
              fontSize: '1px',
              color: '#333333',
              lineHeight: '1px',
              maxHeight: '0px',
              maxWidth: '0px',
              opacity: 0,
              overflow: 'hidden',
            }}
          >
            {previewText}
          </div>
        )}
      </head>
      <body
        style={{
          margin: 0,
          padding: '24px 12px',
          backgroundColor: '#fbfaf6',
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          color: '#1a1a1a',
          lineHeight: 1.6,
        }}
      >
        <table
          role="presentation"
          width="100%"
          border={0}
          cellPadding={0}
          cellSpacing={0}
          style={{ width: '100%', maxWidth: '560px', margin: '0 auto' }}
        >
          {/* Header */}
          <tr>
            <td style={{ paddingBottom: '24px', textAlign: 'left' }}>
              <span
                style={{
                  fontFamily: "Georgia, 'Times New Roman', serif",
                  fontSize: '22px',
                  fontWeight: 'bold',
                  color: '#1a1a1a',
                  letterSpacing: '-0.5px',
                }}
              >
                PM Academy
              </span>
            </td>
          </tr>

          {/* Main Card */}
          <tr>
            <td
              style={{
                backgroundColor: '#ffffff',
                borderRadius: '12px',
                padding: '32px',
                border: '1px solid #e5e5e5',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}
            >
              {children}
            </td>
          </tr>

          {/* Footer */}
          <tr>
            <td
              style={{
                paddingTop: '24px',
                textAlign: 'center',
                fontSize: '12px',
                color: '#737373',
                lineHeight: 1.5,
              }}
            >
              <p style={{ margin: '0 0 8px 0' }}>
                PM Academy — 90 lessons. 9 modules. Free forever.
              </p>
              <p style={{ margin: '0' }}>
                <a
                  href={`${appUrl}/settings?tab=notifications`}
                  style={{ color: '#d97706', textDecoration: 'none', marginRight: '12px' }}
                >
                  Manage Preferences
                </a>
                ·
                <a
                  href={unsubscribeUrl}
                  style={{ color: '#737373', textDecoration: 'underline', marginLeft: '12px' }}
                >
                  Unsubscribe
                </a>
              </p>
              <p style={{ margin: '12px 0 0 0', color: '#a3a3a3' }}>
                © {new Date().getFullYear()} PM Academy. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </body>
    </html>
  )
}
