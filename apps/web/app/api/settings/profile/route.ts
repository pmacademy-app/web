import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase'
import { getAuthenticatedUserFromRequest } from '@/lib/auth'

interface DBChain {
  [method: string]: (...args: unknown[]) => DBChain & Promise<{ data: unknown; error: unknown }>
}

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUserFromRequest(request)

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized. Authenticated session required.' },
        { status: 401 }
      )
    }

    const supabase = createServiceRoleClient()
    const { data: profile, error } = (await (supabase
      .from('users') as unknown as DBChain)
      .select('name, avatar_url, bio, linkedin_url, github_url, website_url, is_portfolio_public, username')
      .eq('id', user.id)
      .maybeSingle()) as unknown as { data: Record<string, unknown> | null; error: unknown }

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch user profile.' }, { status: 500 })
    }

    return NextResponse.json({ success: true, profile })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred.'
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

    const body = await request.json()
    const { name, avatar_url, bio, linkedin_url, github_url, website_url } = body

    const supabase = createServiceRoleClient()
    const { error } = await (supabase
      .from('users') as unknown as DBChain)
      .update({
        name: typeof name === 'string' ? name.trim() : null,
        avatar_url: typeof avatar_url === 'string' ? avatar_url.trim() : null,
        bio: typeof bio === 'string' ? bio.trim() : null,
        linkedin_url: typeof linkedin_url === 'string' ? linkedin_url.trim() : null,
        github_url: typeof github_url === 'string' ? github_url.trim() : null,
        website_url: typeof website_url === 'string' ? website_url.trim() : null,
      })
      .eq('id', user.id)

    if (error) {
      console.error('[API POST /api/settings/profile] Error updating profile:', error)
      return NextResponse.json({ error: 'Failed to update profile settings.' }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
