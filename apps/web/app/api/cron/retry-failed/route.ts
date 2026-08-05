import { NextResponse } from 'next/server'
import { processEmailQueue } from '@/lib/notifications/queue/processor'

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('Authorization')

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await processEmailQueue(50)
  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    retried: result.processed,
  })
}

export async function GET(request: Request) {
  return POST(request)
}
