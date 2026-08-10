/* eslint-disable @next/next/no-head-element */
import React from 'react'
import { BRAND } from '@/lib/brand'

export interface EmailWrapperProps {
  children: React.ReactNode
  previewText?: string
  unsubscribeToken?: string
  isCriticalAuth?: boolean
}

export const EmailWrapper: React.FC<EmailWrapperProps> = ({
  children,
  previewText,
  unsubscribeToken,
  isCriticalAuth = false,
}) => {
  const appUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || BRAND.siteUrl
  const unsubscribeUrl = unsubscribeToken
    ? `${appUrl}/api/email/unsubscribe?token=${unsubscribeToken}`
    : `${appUrl}/settings?tab=notifications`

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{BRAND.fullName}</title>
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
          padding: '32px 16px',
          backgroundColor: '#FBFAF6',
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          color: '#171A17',
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
              <table role="presentation" border={0} cellPadding={0} cellSpacing={0}>
                <tr>
                  <td style={{ verticalAlign: 'middle', paddingRight: '12px' }}>
                    <img
                      src={`${appUrl}${BRAND.assets.logoMarkPng}`}
                      alt={BRAND.company}
                      height="36"
                      style={{ display: 'block', border: 'none', borderRadius: '6px', width: 'auto' }}
                    />
                  </td>
                  <td style={{ verticalAlign: 'middle' }}>
                    <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#1F6B4E', letterSpacing: '-0.02em', display: 'block' }}>
                      {BRAND.company}
                    </span>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#70685A', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {BRAND.product}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          {/* Body Card */}
          <tr>
            <td
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '16px',
                padding: '36px 32px',
                border: '1px solid #DED8CB',
                boxShadow: '0 2px 8px rgba(31, 107, 78, 0.04)',
              }}
            >
              {children}
            </td>
          </tr>

          {/* Footer */}
          <tr>
            <td
              style={{
                paddingTop: '28px',
                textAlign: 'center',
                fontSize: '12px',
                color: '#70685A',
                lineHeight: 1.5,
              }}
            >
              <p style={{ margin: '0 0 8px 0', fontWeight: 600, color: '#171A17' }}>
                {BRAND.fullName} · {BRAND.positioning}
              </p>
              {!isCriticalAuth && (
                <p style={{ margin: '0 0 8px 0' }}>
                  <a
                    href={`${appUrl}/settings?tab=notifications`}
                    style={{ color: '#1F6B4E', textDecoration: 'none', fontWeight: 600, marginRight: '10px' }}
                  >
                    Manage Preferences
                  </a>
                  {' · '}
                  <a
                    href={unsubscribeUrl}
                    style={{ color: '#70685A', textDecoration: 'underline', marginLeft: '10px' }}
                  >
                    Unsubscribe
                  </a>
                </p>
              )}
              <p style={{ margin: '12px 0 0 0', color: '#9EA59D', fontSize: '11px' }}>
                © {new Date().getFullYear()} {BRAND.fullName}. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </body>
    </html>
  )
}
