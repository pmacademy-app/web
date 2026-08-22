import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser, logAdminAction } from '@/lib/admin/guard'
import { createServiceRoleClient } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAdminUser(request)
    if (!authResult.authorized || !authResult.userId) {
      return NextResponse.json(
        { error: authResult.error || 'Unauthorized' },
        { status: authResult.statusCode || 403 }
      )
    }

    const body = await request.json()
    const { key, name, category, subjectLine, bodyHtml, bodyText } = body

    if (!key || typeof key !== 'string' || !/^[a-z0-9_.-]+$/i.test(key.trim())) {
      return NextResponse.json({ error: 'Invalid template key. Use letters, numbers, hyphens, and dots.' }, { status: 400 })
    }

    if (!subjectLine || typeof subjectLine !== 'string') {
      return NextResponse.json({ error: 'Subject line is required.' }, { status: 400 })
    }

    const supabase = createServiceRoleClient()
    const cleanKey = key.trim().toLowerCase()

    // 1. Check uniqueness
    const { data: existing } = await supabase
      .from('notification_templates')
      .select('id')
      .eq('template_key', cleanKey)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ error: `Template with key '${cleanKey}' already exists.` }, { status: 409 })
    }

    const now = new Date().toISOString()

    // 2. Insert root template
    const { data: tpl, error: tplError } = await supabase
      .from('notification_templates')
      .insert({
        template_key: cleanKey,
        category: category || 'Custom',
        current_version: 1,
        created_at: now,
        updated_at: now,
      })
      .select('id')
      .single()

    if (tplError || !tpl) {
      throw new Error(`Failed to create template: ${tplError?.message || 'Unknown'}`)
    }

    // 3. Insert version 1
    const { data: versionRow, error: versionError } = await supabase
      .from('notification_template_versions')
      .insert({
        template_id: tpl.id,
        version: 1,
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
      throw new Error(`Failed to create template version: ${versionError.message}`)
    }

    // 4. Log administrative action
    await logAdminAction(
      authResult.userId,
      authResult.email || 'admin@prodily.me',
      'notification_template_created',
      'notification_template',
      cleanKey,
      {
        templateKey: cleanKey,
        name: name || cleanKey,
        subjectLine: subjectLine.trim(),
        category: category || 'Custom',
      }
    )

    revalidatePath('/admin/communications')

    return NextResponse.json({
      success: true,
      message: `Template '${cleanKey}' created successfully.`,
      data: {
        id: tpl.id,
        key: cleanKey,
        version: versionRow,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create template'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
