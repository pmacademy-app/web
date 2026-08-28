import { NextResponse } from 'next/server'

import { requireAdminUser } from '@/lib/admin/guard'

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('Authorization') || request.headers.get('authorization')
  const isCronAuthorized = Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`)

  if (!isCronAuthorized) {
    const adminCheck = await requireAdminUser(request)
    if (!adminCheck.authorized) {
      return NextResponse.json({ error: 'Unauthorized: Valid CRON_SECRET or Admin session required.' }, { status: 401 })
    }
  }

  // Cleanup old logs placeholder
  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    cleanedRows: 0,
  })
}

export async function GET(request: Request) {
  return POST(request)
}
