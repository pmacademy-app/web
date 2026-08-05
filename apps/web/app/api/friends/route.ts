import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getAuthenticatedUserFromRequest } from '@/lib/auth'
import { getFriendLeaderboard, addFriend, removeFriend } from '@/lib/leaderboard-db'

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
    const friendsEntries = await getFriendLeaderboard(supabase, user.id)

    return NextResponse.json({
      success: true,
      friendsEntries,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch friends.'
    console.error('[API GET /api/friends] Error:', error)
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
    const { username } = body ?? {}

    if (!username || typeof username !== 'string') {
      return NextResponse.json({ error: 'Username is required to add friend.' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()
    const result = await addFriend(supabase, user.id, username.trim())

    return NextResponse.json({
      success: true,
      message: result.message,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to add friend.'
    console.error('[API POST /api/friends] Error:', error)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getAuthenticatedUserFromRequest(request)

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized. Authenticated session required.' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const friendId = searchParams.get('friendId')

    if (!friendId) {
      return NextResponse.json({ error: 'friendId parameter is required.' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()
    await removeFriend(supabase, user.id, friendId)

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to remove friend.'
    console.error('[API DELETE /api/friends] Error:', error)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
