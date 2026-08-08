import { NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/admin/guard'
import { AdminConsoleService } from '@/lib/admin/service'

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
