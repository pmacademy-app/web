import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getAuthenticatedUserFromRequest } from '@/lib/auth'
import { issueCertificate, getUserCertificates } from '@/lib/certificates-db'

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUserFromRequest(request)

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized. Authenticated session required.' },
        { status: 401 }
      )
    }

    const supabase = createServerSupabaseClient()
    const certificates = await getUserCertificates(supabase, user.id)
    return NextResponse.json({ success: true, certificates })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch certificates.'
    console.error('[API GET /api/certificates] Error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUserFromRequest(request)

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized. Authenticated session required.' },
        { status: 401 }
      )
    }

    const supabase = createServerSupabaseClient()
    const body = await request.json().catch(() => ({}))
    const type = body.type || 'full_curriculum'
    const moduleSlug = body.moduleSlug || null

    const certificate = await issueCertificate(supabase, user.id, type, moduleSlug)
    return NextResponse.json({ success: true, certificate })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to issue certificate.'
    console.error('[API POST /api/certificates] Error:', error)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
