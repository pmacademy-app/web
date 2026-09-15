import { NextResponse } from 'next/server'

import { requireUserId } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { getUserFellowState, submitFellowRequest } from '@/lib/fellow-requests-db'
import { createServiceRoleClient } from '@/lib/supabase'

export const GET = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'fellow_requests.state.read',
    summary: 'Unexpected failure fetching Fellow request status',
  },
  async ({ actor }) => {
    const supabase = createServiceRoleClient()
    const state = await getUserFellowState(supabase, requireUserId(actor))

    return NextResponse.json({ success: true, ...state })
  }
)

export const POST = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'fellow_requests.submit',
    summary: 'Unexpected failure submitting a Fellow request',
  },
  async ({ actor }) => {
    const supabase = createServiceRoleClient()
    const result = await submitFellowRequest(supabase, requireUserId(actor))

    return NextResponse.json({ success: true, request: result.request })
  }
)
