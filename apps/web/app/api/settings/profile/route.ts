import { NextResponse } from 'next/server'
import { z } from 'zod'

import { RouteError, withRoute } from '@/lib/api/with-route'
import { validateWritableUrl } from '@/lib/portfolio'
import { createServiceRoleClient } from '@/lib/supabase'

/**
 * N-2: the URL fields are https-only on write. `validateWritableUrl` is separate
 * from the read-side `validateOptionalUrl` on purpose — see the comment on it.
 * Learners whose stored value is `http://` keep rendering; they are only asked
 * for https when they next save.
 */
const urlField = (label: string) =>
  z
    .string()
    .max(500, `${label} must be 500 characters or fewer.`)
    .refine((url) => !url || validateWritableUrl(url), {
      message: `${label} must start with https://`,
    })
    .optional()
    .nullable()

export const profileUpdateSchema = z.object({
  name: z.string().max(100, 'Name must be 100 characters or fewer.').optional().nullable(),
  bio: z.string().max(500, 'Bio must be 500 characters or fewer.').optional().nullable(),
  linkedin_url: urlField('LinkedIn URL'),
  github_url: urlField('GitHub URL'),
  website_url: urlField('Website URL'),
})

export const GET = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'settings.profile.read',
    domain: 'api',
    summary: 'Unexpected failure reading learner profile settings',
  },
  async ({ actor }) => {
    const supabase = createServiceRoleClient()
    const { data: profile, error } = await supabase
      .from('users')
      .select('name, avatar_url, bio, linkedin_url, github_url, website_url, is_portfolio_public, username')
      .eq('id', actor.kind === 'learner' ? actor.userId : '')
      .maybeSingle()

    if (error) {
      throw new RouteError(500, 'SERVER_ERROR', 'Failed to fetch user profile.')
    }

    return NextResponse.json({ success: true, profile })
  }
)

export const POST = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'settings.profile.update',
    domain: 'api',
    summary: 'Unexpected failure updating learner profile settings',
    body: profileUpdateSchema,
  },
  async ({ actor, body }) => {
    const { name, bio, linkedin_url, github_url, website_url } = body

    const supabase = createServiceRoleClient()
    const { error } = await supabase
      .from('users')
      .update({
        name: typeof name === 'string' ? name.trim() : null,
        bio: typeof bio === 'string' ? bio.trim() : null,
        linkedin_url: typeof linkedin_url === 'string' && linkedin_url.trim() ? linkedin_url.trim() : null,
        github_url: typeof github_url === 'string' && github_url.trim() ? github_url.trim() : null,
        website_url: typeof website_url === 'string' && website_url.trim() ? website_url.trim() : null,
      })
      .eq('id', actor.kind === 'learner' ? actor.userId : '')

    if (error) {
      // N-3: the driver error is logged, never returned. Before B7-F the outer
      // catch on this route sent `error.message` straight to an authenticated
      // learner, which can carry a connection string.
      console.error('[API POST /api/settings/profile] Error updating profile:', error)
      throw new RouteError(400, 'SERVER_ERROR', 'Failed to update profile settings.')
    }

    return NextResponse.json({ success: true })
  }
)
