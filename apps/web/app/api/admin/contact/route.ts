import { NextResponse } from 'next/server'
import { requireAdminUser, logAdminAction } from '@/lib/admin/guard'
import { createServiceRoleClient } from '@/lib/supabase'

export async function GET(request: Request) {
  const auth = await requireAdminUser(request)
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.statusCode || 403 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const statusFilter = searchParams.get('status')

    const supabase = createServiceRoleClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (supabase.from('contact_messages' as any) as any)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)

    if (statusFilter && statusFilter !== 'all') {
      query = query.eq('status', statusFilter)
    }

    const { data, error } = await query
    if (error || !data) return NextResponse.json({ messages: [] })

    return NextResponse.json({ messages: data })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch contact messages.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAdminUser(request)
  if (!auth.authorized || !auth.userId || !auth.email) {
    return NextResponse.json({ error: auth.error }, { status: auth.statusCode || 403 })
  }

  try {
    const body = await request.json()
    const { messageId, status, adminNotes } = body

    if (!messageId || !status) {
      return NextResponse.json({ error: 'Message ID and status are required.' }, { status: 400 })
    }

    const supabase = createServiceRoleClient()
    const updatePayload: Record<string, unknown> = {
      status,
    }
    if (typeof adminNotes === 'string') {
      updatePayload.admin_notes = adminNotes.trim()
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from('contact_messages' as any) as any)
      .update(updatePayload)
      .eq('id', messageId)

    if (error) {
      return NextResponse.json({ error: 'Failed to update contact message status.' }, { status: 500 })
    }

    await logAdminAction(auth.userId, auth.email, `contact_message_${status}`, 'contact_message', messageId, {
      status,
      adminNotes: Boolean(adminNotes),
    })

    return NextResponse.json({ success: true, messageId })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update contact message.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
