import { adminErrorMessage } from '@/lib/errors/api-response'
import { NextResponse } from 'next/server'
import { logAdminAction } from '@/lib/admin/guard'
import { requireAdmin } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { createServiceRoleClient } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

export const runtime = 'nodejs'


export const POST = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.notifications.templates.key.toggle_pause.post',
    domain: 'admin',
    summary: 'Unexpected failure in POST /api/admin/notifications/templates/[key]/toggle-pause',
  },
  async ({ request, actor, params }) => {
    try {
      const admin = requireAdmin(actor)
      const { key } = params
      const body = await request.json()
      const { paused } = body

      if (typeof paused !== 'boolean') {
        return NextResponse.json({ error: 'paused boolean field is required' }, { status: 400 })
      }

      const isCritical = key === 'auth.verify_email' || key === 'auth.password_reset' || key === 'auth.email_change_verify'
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
        admin.userId,
        admin.email || 'admin@prodily.me',
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
      const message = adminErrorMessage(err, 'Failed to toggle pause state')
      return NextResponse.json({ success: false, error: message }, { status: 500 })
    }
  }
)
