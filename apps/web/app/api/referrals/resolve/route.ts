import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase'
import { resolveReferralCode } from '@/lib/referral/referral-service'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get('code')
    if (!code) {
      return NextResponse.json({ valid: false, error: 'No code provided' }, { status: 400 })
    }

    const supabase = createServiceRoleClient()
    const referrer = await resolveReferralCode(supabase, code)

    if (!referrer) {
      return NextResponse.json({ valid: false, error: 'Referral code not found' }, { status: 404 })
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
  } catch (err) {
    console.error('[api/referrals/resolve] Error:', err)
    return NextResponse.json({ valid: false, error: 'Failed to resolve referral code' }, { status: 500 })
  }
}
