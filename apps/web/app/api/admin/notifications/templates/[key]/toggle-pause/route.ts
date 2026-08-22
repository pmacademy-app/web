import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser, logAdminAction } from '@/lib/admin/guard'
import { createServiceRoleClient } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

export const runtime = 'nodejs'

interface RouteParams {
  params: Promise<{ key: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireAdminUser(request)
    if (!authResult.authorized || !authResult.userId) {
      return NextResponse.json(
        { error: authResult.error || 'Unauthorized' },
        { status: authResult.statusCode || 403 }
      )
    }

    const { key } = await params
    const body = await request.json()
    const { paused } = body

    if (typeof paused !== 'boolean') {
      return NextResponse.json({ error: 'paused boolean field is required' }, { status: 400 })
    }

    const isCritical = key === 'auth.verify_email' || key === 'auth.password_reset'
    if (isCritical && paused) {
      return NextResponse.json({ error: 'Critical authentication emails cannot be paused.' }, { status: 400 })
    }

    const supabase = createServiceRoleClient()
    const now = new Date().toISOString()
    const targetStatus = paused ? 'paused' : 'published'

    // 1. Update status in notification_template_versions if template exists
    const { data: tpl } = await supabase
      .from('notification_templates')
      .select('id')
      .eq('template_key', key)
      .maybeSingle()

    if (tpl?.id) {
      await supabase
        .from('notification_template_versions')
        .update({ status: targetStatus, updated_at: now })
        .eq('template_id', tpl.id)
    }

    // 2. Update automation toggle in system_settings (key: email_automations)
    const { data: rawSettings } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'email_automations')
      .maybeSingle()

    const currentToggles = (rawSettings?.value && typeof rawSettings.value === 'object' ? rawSettings.value : {}) as Record<string, boolean>
    const updatedToggles = {
      ...currentToggles,
      [key]: !paused,
    }

    await supabase
      .from('system_settings')
      .upsert({
        key: 'email_automations',
        value: updatedToggles,
        updated_at: now,
      })

    // 3. Log administrative audit action
    const action = paused ? 'notification_paused' : 'notification_resumed'
    await logAdminAction(
      authResult.userId,
      authResult.email || 'admin@prodily.me',
      action,
      'notification_template',
      key,
      { templateKey: key, paused, status: targetStatus }
    )

    revalidatePath('/admin/communications')
    revalidatePath(`/admin/communications/templates/${key}`)

    return NextResponse.json({
      success: true,
      message: `Notification '${key}' has been ${paused ? 'paused' : 'resumed'}.`,
      status: targetStatus,
      enabled: !paused,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to toggle pause state'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
