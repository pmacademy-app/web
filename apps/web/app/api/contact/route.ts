import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getAuthenticatedUserFromRequest } from '@/lib/auth'
import { evaluateRateLimit } from '@/lib/rate-limit'
import { enqueueNotificationItem } from '@/lib/notifications/queue/processor'

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUserFromRequest(request)
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0] || 'anon'
    const rateCheck = evaluateRateLimit(`contact_${user ? user.id : clientIp}`, { limit: 3, windowMs: 10 * 60 * 1000 })

    if (!rateCheck.success) {
      return NextResponse.json({ error: 'Too many contact messages sent. Please try again later.' }, { status: 429 })
    }

    const body = await request.json()
    const { name, email, subject, category, message } = body

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Name is required.' }, { status: 400 })
    }
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email address is required.' }, { status: 400 })
    }
    if (!subject || typeof subject !== 'string' || !subject.trim()) {
      return NextResponse.json({ error: 'Subject is required.' }, { status: 400 })
    }
    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json({ error: 'Message content is required.' }, { status: 400 })
    }

    const cleanName = name.trim().substring(0, 100)
    const cleanEmail = email.trim().toLowerCase().substring(0, 150)
    const cleanSubject = subject.trim().substring(0, 200)
    const cleanCategory = typeof category === 'string' ? category.trim().substring(0, 50) : 'general'
    const cleanMessage = message.trim().substring(0, 3000)

    const supabase = createServerSupabaseClient()
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from('contact_messages' as any) as any)
      .insert({
        user_id: user ? user.id : null,
        name: cleanName,
        email: cleanEmail,
        subject: cleanSubject,
        category: cleanCategory,
        message: cleanMessage,
        status: 'new',
        source: 'web_form',
      })
      .select('id')
      .single()

    if (error || !data) {
      console.error('[contact/route] Error inserting contact message:', error)
      return NextResponse.json({ error: 'Failed to record contact message.' }, { status: 500 })
    }

    // Dispatch email alert to pmacademyapp@gmail.com inbox
    try {
      await enqueueNotificationItem({
        userId: user ? user.id : '00000000-0000-0000-0000-000000000000',
        toEmail: 'pmacademyapp@gmail.com',
        toName: 'PM Academy Support',
        channel: 'email',
        templateKey: 'auth.welcome',
        templateVariables: {
          userName: `Support Team (Inquiry from ${cleanName} <${cleanEmail}>)`,
        },
        eventId: `contact_${data.id}`,
        eventType: 'contact.received',
        category: 'security',
        priorityLevel: 'high',
      })
    } catch (emailErr) {
      console.warn('[contact/route] Non-fatal warning queueing alert email:', emailErr)
    }

    return NextResponse.json({ success: true, messageId: data.id })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error submitting contact form.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
