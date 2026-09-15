import { NextResponse } from 'next/server'

import { RouteError, withRoute } from '@/lib/api/with-route'
import { resolveReferralCode } from '@/lib/referral/referral-service'
import { createServiceRoleClient } from '@/lib/supabase'

export const runtime = 'nodejs'

/**
 * Deliberately open to `anonymous`: a referral link is followed before the invitee
 * has an account. The response exposes only the referrer's public identity, which
 * is the same set the pre-migration route allowed through.
 *
 * `valid: false` is carried on refusals through `extra`. The one current consumer
 * (`ReferralBadge`) bails on a non-2xx before reading it, so this is for the
 * contract's sake rather than a caller's — the field was there before, and a
 * migration is not the place to quietly drop it.
 */
export const GET = withRoute(
  {
    actor: { allow: ['anonymous', 'learner'] },
    operation: 'referrals.resolve',
    summary: 'Unexpected failure resolving a referral code',
    errorMessage: 'Failed to resolve referral code',
    errorCode: 'SERVER_ERROR',
  },
  async ({ request }) => {
    // Validated in the handler rather than by a declared query schema so that both
    // refusals keep carrying `valid: false`, as they did before migration.
    const code = new URL(request.url).searchParams.get('code')
    if (!code) {
      throw new RouteError(400, 'VALIDATION', 'No code provided', { valid: false })
    }

    const supabase = createServiceRoleClient()
    const referrer = await resolveReferralCode(supabase, code)

    if (!referrer) {
      throw new RouteError(404, 'NOT_FOUND', 'Referral code not found', { valid: false })
    }

    // Do not return sensitive fields
    return NextResponse.json({
      valid: true,
      referrer: {
        id: referrer.id,
        username: referrer.username,
        name: referrer.name,
      },
    })
  }
)
