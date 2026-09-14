import { adminErrorMessage } from '@/lib/errors/api-response'
import { NextResponse } from 'next/server'
import { logAdminAction } from '@/lib/admin/guard'
import { requireAdmin } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { createServiceRoleClient } from '@/lib/supabase'
import { CommunicationsService } from '@/lib/admin/communications-service'
import { sanitizeEmailHtml } from '@/lib/admin/sanitize-email-html'
import { revalidatePath } from 'next/cache'

export const runtime = 'nodejs'


export const GET = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.notifications.templates.key.get',
    domain: 'admin',
    summary: 'Unexpected failure in GET /api/admin/notifications/templates/[key]',
  },
  async ({ params }) => {
    try {
      const { key } = params
      const detail = await CommunicationsService.getTemplateDetail(key)
      if (!detail) {
        return NextResponse.json({ error: `Template '${key}' not found` }, { status: 404 })
      }

      return NextResponse.json({ success: true, data: detail })
    } catch (err) {
      const message = adminErrorMessage(err, 'Failed to fetch template detail')
      return NextResponse.json({ success: false, error: message }, { status: 500 })
    }
  }
)

export const PATCH = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.notifications.templates.key.patch',
    domain: 'admin',
    summary: 'Unexpected failure in PATCH /api/admin/notifications/templates/[key]',
  },
  async ({ request, actor, params }) => {
    try {
      const admin = requireAdmin(actor)
      const { key } = params
      const body = await request.json()
      const { subjectLine, bodyHtml, bodyText, status = 'published' } = body

      if (!subjectLine || typeof subjectLine !== 'string') {
        return NextResponse.json({ error: 'subjectLine is required and must be a string' }, { status: 400 })
      }

      // Admin-pasted HTML is untrusted input — sanitize before it is ever persisted.
      const cleanBodyHtml = sanitizeEmailHtml((bodyHtml || '').trim())
      const cleanBodyText = (bodyText || '').trim()

      const versionStatus = status === 'draft' ? 'draft' : 'published'
      const supabase = createServiceRoleClient()
      const now = new Date().toISOString()

      // 1. Check if template exists in notification_templates table
      const { data: existingTpl } = await supabase
        .from('notification_templates')
        .select('id, current_version, category')
        .eq('template_key', key)
        .maybeSingle()

      let templateId: string

      if (!existingTpl) {
        // Create new template root entry
        const { data: createdTpl, error: createError } = await supabase
          .from('notification_templates')
          .insert({
            template_key: key,
            category: 'Transactional',
            current_version: 1,
            created_at: now,
            updated_at: now,
          })
          .select('id, current_version')
          .single()

        if (createError || !createdTpl) {
          throw new Error(`Failed to create template root: ${createError?.message || 'Unknown'}`)
        }
        templateId = createdTpl.id
      } else {
        templateId = existingTpl.id
      }

      // 2. Fetch current max version to insert next version row
      const { data: versions } = await supabase
        .from('notification_template_versions')
        .select('version')
        .eq('template_id', templateId)
        .order('version', { ascending: false })
        .limit(1)

      const nextVersion = (versions && versions.length > 0 ? versions[0].version : 0) + 1

      // If publishing, archive previous published versions
      if (versionStatus === 'published') {
        await supabase
          .from('notification_template_versions')
          .update({ status: 'archived', updated_at: now })
          .eq('template_id', templateId)
          .eq('status', 'published')

        await supabase
          .from('notification_templates')
          .update({
            current_version: nextVersion,
            updated_at: now,
          })
          .eq('id', templateId)
      }

      const { data: versionRow, error: versionError } = await supabase
        .from('notification_template_versions')
        .insert({
          template_id: templateId,
          version: nextVersion,
          subject_line: subjectLine.trim(),
          body_html: cleanBodyHtml,
          body_text: cleanBodyText,
          status: versionStatus,
          created_at: now,
          updated_at: now,
        })
        .select('*')
        .single()

      if (versionError) {
        throw new Error(`Failed to insert template version: ${versionError.message}`)
      }

      // 3. Log administrative action
      await logAdminAction(
        admin.userId,
        admin.email || 'admin@prodily.me',
        versionStatus === 'published' ? 'notification_template_published' : 'notification_template_draft_saved',
        'notification_template',
        key,
        {
          templateKey: key,
          version: nextVersion,
          subjectLine: subjectLine.trim(),
          status: versionStatus,
        }
      )

      revalidatePath('/admin/communications')
      revalidatePath(`/admin/communications/templates/${key}`)

      return NextResponse.json({
        success: true,
        message: versionStatus === 'published'
          ? `Template '${key}' published as active version v${nextVersion}.`
          : `Template '${key}' draft saved as v${nextVersion}.`,
        data: versionRow,
      })
    } catch (err) {
      const message = adminErrorMessage(err, 'Failed to update template')
      return NextResponse.json({ success: false, error: message }, { status: 500 })
    }
  }
)
