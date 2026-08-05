import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const payload = await request.json()
    // Process Resend delivery/open/bounce event payload
    console.log('[ResendWebhook] Received event:', payload?.type || 'unknown')

    return NextResponse.json({ success: true, received: true })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Invalid webhook payload'
    return NextResponse.json({ success: false, error: errorMsg }, { status: 400 })
  }
}
