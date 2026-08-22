import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser, logAdminAction } from '@/lib/admin/guard'
import { createServiceRoleClient } from '@/lib/supabase'
import { CommunicationsService } from '@/lib/admin/communications-service'
import { revalidatePath } from 'next/cache'

export const runtime = 'nodejs'

interface RouteParams {
  params: Promise<{ key: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireAdminUser(request)
    if (!authResult.authorized || !authResult.userId) {
      return NextResponse.json(
        { error: authResult.error || 'Unauthorized' },
        { status: authResult.statusCode || 403 }
      )
    }

    const { key } = await params
    const detail = await CommunicationsService.getTemplateDetail(key)
    if (!detail) {
      return NextResponse.json({ error: `Template '${key}' not found` }, { status: 404 })
    }

    return NextResponse.json({ success: true, data: detail })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch template detail'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
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
    const { subjectLine, bodyHtml, bodyText } = body

    if (!subjectLine || typeof subjectLine !== 'string') {
      return NextResponse.json({ error: 'subjectLine is required and must be a string' }, { status: 400 })
    }

    const supabase = createServiceRoleClient()

    // 1. Check if template exists in notification_templates table
    const { data: existingTpl } = await supabase
      .from('notification_templates')
      .select('id, current_version, category')
      .eq('template_key', key)
      .maybeSingle()

    const now = new Date().toISOString()
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
      // Bump version
      await supabase
        .from('notification_templates')
        .update({
          current_version: (existingTpl.current_version || 1) + 1,
          updated_at: now,
        })
        .eq('id', templateId)
    }

    // 2. Fetch current max version to insert next version row
    const { data: versions } = await supabase
      .from('notification_template_versions')
      .select('version')
      .eq('template_id', templateId)
      .order('version', { ascending: false })
      .limit(1)

    const nextVersion = (versions && versions.length > 0 ? versions[0].version : 0) + 1

    const { data: versionRow, error: versionError } = await supabase
      .from('notification_template_versions')
      .insert({
        template_id: templateId,
        version: nextVersion,
        subject_line: subjectLine.trim(),
        body_html: (bodyHtml || '').trim(),
        body_text: (bodyText || '').trim(),
        status: 'published',
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
      authResult.userId,
      authResult.email || 'admin@prodily.me',
      'notification_template_updated',
      'notification_template',
      key,
      {
        templateKey: key,
        version: nextVersion,
        subjectLine: subjectLine.trim(),
      }
    )

    revalidatePath('/admin/communications')
    revalidatePath(`/admin/communications/templates/${key}`)

    return NextResponse.json({
      success: true,
      message: `Template '${key}' updated to version ${nextVersion}`,
      data: versionRow,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update template'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
