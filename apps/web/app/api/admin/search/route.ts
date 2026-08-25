import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/admin/guard'
import { createServiceRoleClient } from '@/lib/supabase'
import { fetchCurriculumData } from '@/lib/lesson-loader'
import { CURRICULUM_MODULE_META } from '@/lib/admin/curriculum-meta'

export interface AdminSearchResultItem {
  id: string
  title: string
  subtitle: string
  category: 'users' | 'curriculum' | 'certificates' | 'communications'
  href: string
  badge?: string
}

export interface AdminSearchResponse {
  success: boolean
  query: string
  total: number
  results: {
    users: AdminSearchResultItem[]
    curriculum: AdminSearchResultItem[]
    certificates: AdminSearchResultItem[]
    communications: AdminSearchResultItem[]
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser(request)
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.statusCode || 403 })
  }

  const { searchParams } = new URL(request.url)
  const query = (searchParams.get('q') || '').trim()

  if (!query || query.length < 2) {
    return NextResponse.json({
      success: true,
      query,
      total: 0,
      results: {
        users: [],
        curriculum: [],
        certificates: [],
        communications: [],
      },
    })
  }

  const supabase = createServiceRoleClient()
  const qLower = query.toLowerCase()

  try {
    // 1. Search Users
    const usersPromise = (async (): Promise<AdminSearchResultItem[]> => {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, email, username, is_admin')
        .or(`name.ilike.%${query}%,email.ilike.%${query}%,username.ilike.%${query}%`)
        .limit(5)

      if (error || !data) return []
      return (data as Array<{ id: string; name?: string | null; email?: string | null; username?: string | null; is_admin?: boolean }>).map((u) => ({
        id: u.id,
        title: u.name || u.username || u.email?.split('@')[0] || 'User',
        subtitle: u.email || `@${u.username || 'user'}`,
        category: 'users' as const,
        href: `/admin/users?search=${encodeURIComponent(u.email || u.name || u.id)}`,
        badge: u.is_admin ? 'Admin' : 'Learner',
      }))
    })()

    // 2. Search Curriculum (in-memory search across compiled modules and lessons)
    const curriculumPromise = (async (): Promise<AdminSearchResultItem[]> => {
      try {
        const curriculum = await fetchCurriculumData()
        if (!curriculum || !curriculum.lessons) return []
        const results: AdminSearchResultItem[] = []

        // Search module titles
        for (const [slug, meta] of Object.entries(CURRICULUM_MODULE_META)) {
          if (meta.name.toLowerCase().includes(qLower) || slug.toLowerCase().includes(qLower)) {
            results.push({
              id: `module-${slug}`,
              title: meta.name,
              subtitle: `Module · ${meta.description.slice(0, 50)}...`,
              category: 'curriculum' as const,
              href: `/admin/curriculum/${slug}`,
              badge: 'Module',
            })
          }
        }

        // Search lesson titles & slugs
        for (const lesson of curriculum.lessons) {
          if (
            lesson.title.toLowerCase().includes(qLower) ||
            lesson.slug.toLowerCase().includes(qLower)
          ) {
            const moduleName = CURRICULUM_MODULE_META[lesson.module]?.name || lesson.module
            results.push({
              id: `lesson-${lesson.slug}`,
              title: lesson.title,
              subtitle: `${moduleName} · Lesson ${lesson.order}`,
              category: 'curriculum' as const,
              href: `/admin/curriculum/${lesson.module}/${lesson.slug}`,
              badge: 'Lesson',
            })
            if (results.length >= 6) break
          }
        }

        return results.slice(0, 5)
      } catch {
        return []
      }
    })()

    // 3. Search Certificates
    const certificatesPromise = (async (): Promise<AdminSearchResultItem[]> => {
      const { data, error } = await supabase
        .from('certificates')
        .select('id, certificate_code, learner_name, career_title')
        .or(`certificate_code.ilike.%${query}%,learner_name.ilike.%${query}%,career_title.ilike.%${query}%`)
        .limit(5)

      if (error || !data) return []
      return (data as Array<{ id: string; certificate_code: string; learner_name: string; career_title: string }>).map((c) => ({
        id: c.id,
        title: c.certificate_code,
        subtitle: `${c.learner_name} · ${c.career_title}`,
        category: 'certificates' as const,
        href: `/admin/achievements/certificates`,
        badge: 'Certificate',
      }))
    })()

    // 4. Search Communications / Inquiries
    const communicationsPromise = (async (): Promise<AdminSearchResultItem[]> => {
      const { data, error } = await supabase
        .from('contact_messages')
        .select('id, subject, name, email, status')
        .or(`subject.ilike.%${query}%,name.ilike.%${query}%,email.ilike.%${query}%`)
        .limit(5)

      if (error || !data) return []
      return (data as Array<{ id: string; subject: string; name: string; email: string; status: string }>).map((m) => ({
        id: m.id,
        title: m.subject || 'Support Message',
        subtitle: `${m.name} (${m.email})`,
        category: 'communications' as const,
        href: `/admin/communications?tab=inquiries`,
        badge: m.status || 'New',
      }))
    })()

    const [users, curriculum, certificates, communications] = await Promise.all([
      usersPromise,
      curriculumPromise,
      certificatesPromise,
      communicationsPromise,
    ])

    const total = users.length + curriculum.length + certificates.length + communications.length

    return NextResponse.json({
      success: true,
      query,
      total,
      results: {
        users,
        curriculum,
        certificates,
        communications,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Search failed'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
