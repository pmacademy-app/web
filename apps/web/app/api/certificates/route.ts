import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { issueCertificate, getUserCertificates } from '@/lib/certificates-db'

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null

    const supabase = createServerSupabaseClient()
    let userId: string | null = null

    if (token) {
      const { data: { user }, error: tokenErr } = await supabase.auth.getUser(token)
      if (!tokenErr && user) {
        userId = user.id
      }
    }

    if (!userId) {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (!authError && user) {
        userId = user.id
      }
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized. Authenticated session required.' },
        { status: 401 }
      )
    }

    const certificates = await getUserCertificates(supabase, userId)
    return NextResponse.json({ success: true, certificates })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch certificates.'
    console.error('[API GET /api/certificates] Error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null

    const supabase = createServerSupabaseClient()
    let userId: string | null = null

    if (token) {
      const { data: { user }, error: tokenErr } = await supabase.auth.getUser(token)
      if (!tokenErr && user) {
        userId = user.id
      }
    }

    if (!userId) {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (!authError && user) {
        userId = user.id
      }
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized. Authenticated session required.' },
        { status: 401 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const type = body.type || 'full_curriculum'
    const moduleSlug = body.moduleSlug || null

    const certificate = await issueCertificate(supabase, userId, type, moduleSlug)
    return NextResponse.json({ success: true, certificate })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to issue certificate.'
    console.error('[API POST /api/certificates] Error:', error)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
