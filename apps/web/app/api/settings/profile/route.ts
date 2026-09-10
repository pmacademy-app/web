import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceRoleClient } from '@/lib/supabase'
import { getAuthenticatedUserFromRequest } from '@/lib/auth'
import { validateOptionalUrl } from '@/lib/portfolio'

interface DBChain {
  [method: string]: (...args: unknown[]) => DBChain & Promise<{ data: unknown; error: unknown }>
}

export const profileUpdateSchema = z.object({
  name: z.string().max(100, 'Name must be 100 characters or fewer.').optional().nullable(),
  bio: z.string().max(500, 'Bio must be 500 characters or fewer.').optional().nullable(),
  linkedin_url: z
    .string()
    .max(500, 'LinkedIn URL must be 500 characters or fewer.')
    .refine((url) => !url || validateOptionalUrl(url), {
      message: 'LinkedIn URL must start with http:// or https://',
    })
    .optional()
    .nullable(),
  github_url: z
    .string()
    .max(500, 'GitHub URL must be 500 characters or fewer.')
    .refine((url) => !url || validateOptionalUrl(url), {
      message: 'GitHub URL must start with http:// or https://',
    })
    .optional()
    .nullable(),
  website_url: z
    .string()
    .max(500, 'Website URL must be 500 characters or fewer.')
    .refine((url) => !url || validateOptionalUrl(url), {
      message: 'Website URL must start with http:// or https://',
    })
    .optional()
    .nullable(),
})

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

    let rawBody: unknown
    try {
      rawBody = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 })
    }

    const parsed = profileUpdateSchema.safeParse(rawBody)
    if (!parsed.success) {
      const errorMsg = parsed.error.issues[0]?.message || 'Invalid profile settings.'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    const { name, bio, linkedin_url, github_url, website_url } = parsed.data

    const supabase = createServiceRoleClient()
    const { error } = await (supabase
      .from('users') as unknown as DBChain)
      .update({
        name: typeof name === 'string' ? name.trim() : null,
        bio: typeof bio === 'string' ? bio.trim() : null,
        linkedin_url: typeof linkedin_url === 'string' && linkedin_url.trim() ? linkedin_url.trim() : null,
        github_url: typeof github_url === 'string' && github_url.trim() ? github_url.trim() : null,
        website_url: typeof website_url === 'string' && website_url.trim() ? website_url.trim() : null,
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
