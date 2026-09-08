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

  // NOT IMPLEMENTED. No retention policy has been decided, so this route deletes
  // nothing. It previously returned a plain success with cleanedRows: 0, which made a
  // green scheduled run look like retention was happening. Report the truth instead so
  // the workflow does not imply work that is not being done. See ISSUES_KNOWN.md D-06
  // and ISSUE-21.
  console.warn('[cron/cleanup] No-op: retention policy not implemented; no rows were deleted.')

  return NextResponse.json({
    success: true,
    implemented: false,
    note: 'Retention cleanup is not implemented. No rows were deleted. See ISSUES_KNOWN.md ISSUE-21.',
    timestamp: new Date().toISOString(),
    cleanedRows: 0,
  })
}

export async function GET(request: Request) {
  return POST(request)
}
