import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireUserId } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { getFriendLeaderboard, addFriend, removeFriend } from '@/lib/leaderboard/leaderboard-db'
import { createServiceRoleClient } from '@/lib/supabase'

const addFriendSchema = z.object({
  username: z.string().min(1, 'Username is required to add friend.'),
})

const removeFriendSchema = z.object({
  friendId: z.string().min(1, 'friendId parameter is required.'),
})

export const GET = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'friends.read',
    summary: 'Unexpected failure fetching friend leaderboard',
  },
  async ({ actor }) => {
    const supabase = createServiceRoleClient()
    const friendsEntries = await getFriendLeaderboard(supabase, requireUserId(actor))

    return NextResponse.json({ success: true, friendsEntries })
  }
)

export const POST = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'friends.add',
    summary: 'Unexpected failure adding a study friend',
    body: addFriendSchema,
    // Each add looks another learner up by username, so an unbounded loop could
    // probe handles. 30 per 10 minutes is far past anyone adding friends by hand.
    rateLimit: [
      {
        key: ({ actor }) => (actor.kind === 'learner' ? `friends_add_${actor.userId}` : null),
        limit: 30,
        windowMs: 10 * 60 * 1000,
      },
    ],
  },
  async ({ actor, body }) => {
    const supabase = createServiceRoleClient()
    const result = await addFriend(supabase, requireUserId(actor), body.username.trim())

    return NextResponse.json({ success: true, message: result.message })
  }
)

export const DELETE = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'friends.remove',
    summary: 'Unexpected failure removing a study friend',
    query: removeFriendSchema,
  },
  async ({ actor, query }) => {
    const supabase = createServiceRoleClient()
    await removeFriend(supabase, requireUserId(actor), query.friendId)

    return NextResponse.json({ success: true })
  }
)
