import { NextResponse } from 'next/server'
import { createPublicClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  const startTime = Date.now()
  let dbStatus = 'connected'

  try {
    const supabase = createPublicClient()
    const { error } = await supabase.from('users').select('id').limit(1)
    if (error && !error.message?.includes('JWT')) {
      dbStatus = 'degraded'
    }
  } catch {
    dbStatus = 'unreachable'
  }

  const responseTimeMs = Date.now() - startTime

  return NextResponse.json(
    {
      status: dbStatus === 'unreachable' ? 'error' : 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime ? Math.floor(process.uptime()) : null,
      database: dbStatus,
      latencyMs: responseTimeMs,
      environment: process.env.NODE_ENV || 'production',
    },
    {
      status: dbStatus === 'unreachable' ? 503 : 200,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    }
  )
}
