import { NextResponse } from 'next/server'
import { requireAdminUser, logAdminAction } from '@/lib/admin/guard'
import { AdminConsoleService } from '@/lib/admin/service'
import { createServiceRoleClient } from '@/lib/supabase'
import { deleteAccount, resetProgress } from '@/lib/settings/settings-service'

interface Context {
  params: Promise<{ id: string }>
}

export async function GET(request: Request, { params }: Context) {
  const auth = await requireAdminUser(request)
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.statusCode || 403 })
  }

  try {
    const { id } = await params
    const userDetail = await AdminConsoleService.getUserDetail(id)

    if (!userDetail) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({ user: userDetail })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch user details.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: Context) {
  const auth = await requireAdminUser(request)
  if (!auth.authorized || !auth.userId || !auth.email) {
    return NextResponse.json({ error: auth.error }, { status: auth.statusCode || 403 })
  }

  try {
    const { id } = await params
    const supabase = createServiceRoleClient()

    await deleteAccount(supabase, id)
    await logAdminAction(auth.userId, auth.email, 'admin_user_deleted', 'user', id)

    return NextResponse.json({ success: true, deletedUserId: id })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete user account.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request, { params }: Context) {
  const auth = await requireAdminUser(request)
  if (!auth.authorized || !auth.userId || !auth.email) {
    return NextResponse.json({ error: auth.error }, { status: auth.statusCode || 403 })
  }

  try {
    const { id } = await params
    const body = await request.json()
    const { action } = body

    const supabase = createServiceRoleClient()

    if (action === 'reset_progress') {
      await resetProgress(supabase, id, 'all')
      await logAdminAction(auth.userId, auth.email, 'admin_reset_progress', 'user', id)
      return NextResponse.json({ success: true, resetUserId: id })
    }

    return NextResponse.json({ error: 'Invalid admin action' }, { status: 400 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to execute admin action.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
