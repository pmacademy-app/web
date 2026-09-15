import { NextResponse } from 'next/server'

import { logAdminAction } from '@/lib/admin/guard'
import { requireAdmin } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { adminErrorMessage } from '@/lib/errors/api-response'
import { createServiceRoleClient } from '@/lib/supabase'

export const GET = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.contact.get',
    domain: 'admin',
    summary: 'Unexpected failure in GET /api/admin/contact',
  },
  async ({ request }) => {
    try {
      const { searchParams } = new URL(request.url)
      const statusFilter = searchParams.get('status')

      const supabase = createServiceRoleClient()
      let query = supabase.from('contact_messages')
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
      const message = adminErrorMessage(error, 'Failed to fetch contact messages.')
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }
)

export const PATCH = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.contact.patch',
    domain: 'admin',
    summary: 'Unexpected failure in PATCH /api/admin/contact',
  },
  async ({ request, actor }) => {
    const admin = requireAdmin(actor)
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

      const { error } = await supabase.from('contact_messages')
        .update(updatePayload as import('@/lib/supabase').TablesUpdate<'contact_messages'>)
        .eq('id', messageId)

      if (error) {
        return NextResponse.json({ error: 'Failed to update contact message status.' }, { status: 500 })
      }

      await logAdminAction(admin.userId, admin.email, `contact_message_${status}`, 'contact_message', messageId, {
        status,
        adminNotes: Boolean(adminNotes),
      })

      return NextResponse.json({ success: true, messageId })
    } catch (error: unknown) {
      const message = adminErrorMessage(error, 'Failed to update contact message.')
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }
)
