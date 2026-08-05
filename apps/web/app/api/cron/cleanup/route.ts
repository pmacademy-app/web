import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('Authorization')

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
