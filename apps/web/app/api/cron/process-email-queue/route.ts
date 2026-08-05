import { NextResponse } from 'next/server'
import { processEmailQueue } from '@/lib/notifications/queue/processor'

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('Authorization')

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await processEmailQueue(50)
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      result,
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Cron execution failed'
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 })
  }
}

export async function GET(request: Request) {
  return POST(request)
}
