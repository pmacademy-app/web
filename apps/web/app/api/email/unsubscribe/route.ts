import { NextResponse } from 'next/server'
import { BRAND } from '@/lib/brand'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')

  if (!token) {
    return NextResponse.json({ error: 'Missing unsubscribe token' }, { status: 400 })
  }

  // Unsubscribe token validation logic
  return new NextResponse(
    `<!DOCTYPE html>
    <html>
      <head>
        <title>Unsubscribed — ${BRAND.fullName}</title>
        <style>
          body { font-family: -apple-system, sans-serif; background: ${BRAND.colors.background}; padding: 40px 20px; text-align: center; color: ${BRAND.colors.foreground}; }
          .card { max-width: 480px; margin: 0 auto; background: #fff; padding: 32px; border-radius: 12px; border: 1px solid #e5e5e5; }
          h1 { color: ${BRAND.colors.primary}; font-size: 24px; }
          p { color: #525252; font-size: 14px; line-height: 1.6; }
          a { color: ${BRAND.colors.primary}; font-weight: 600; text-decoration: none; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>You have been unsubscribed</h1>
          <p>You will no longer receive non-essential notification emails from Prodily PM Academy.</p>
          <p><a href="/settings?tab=notifications">Manage your notification settings</a></p>
        </div>
      </body>
    </html>`,
    {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }
  )
}
