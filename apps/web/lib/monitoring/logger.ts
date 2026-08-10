import crypto from 'crypto'

export type ErrorSeverity = 'critical' | 'error' | 'warning'
export type ErrorCategory = 'auth' | 'verification' | 'queue' | 'resend' | 'webhook' | 'cron' | 'system'

export interface LogSystemErrorOptions {
  severity: ErrorSeverity
  category: ErrorCategory
  operation: string
  message: string
  templateKey?: string
  queueId?: string
  resendId?: string
  userId?: string
  details?: Record<string, unknown>
}

/**
 * Sanitizes sensitive content from error messages and metadata.
 * Strips bearer tokens, passwords, API keys, webhook secrets, and raw credentials.
 */
export function sanitizeErrorMessage(input: string): string {
  if (!input) return ''
  return input
    .replace(/Bearer\s+[A-Za-z0-9\-\._~\+\/]+=*/gi, 'Bearer [REDACTED]')
    .replace(/(?:key|secret|token|password|auth|authorization)=['"]?[A-Za-z0-9\-\._~\+\/]+['"]?/gi, '$1=[REDACTED]')
    .replace(/whsec_[A-Za-z0-9\+\/]+/gi, 'whsec_[REDACTED]')
    .replace(/re_[A-Za-z0-9_]+/gi, 're_[REDACTED]')
    .replace(/v1,[A-Za-z0-9\+\/=]+/gi, 'v1,[REDACTED]')
}

/**
 * Structured System Error Logger
 * Persists sanitized errors into public.system_errors, deduplicates identical incidents,
 * and dispatches Admin in-app notifications for critical incidents.
 */
export async function logSystemError(options: LogSystemErrorOptions): Promise<string | null> {
  const sanitizedMsg = sanitizeErrorMessage(options.message)
  const fingerprint = crypto
    .createHash('md5')
    .update(`${options.category}:${options.operation}:${sanitizedMsg}`)
    .digest('hex')

  console.error(
    `[SystemError:${options.severity.toUpperCase()}:${options.category}] ${options.operation} - ${sanitizedMsg}`
  )

  try {
    const { createServerSupabaseClient } = await import('@/lib/supabase')
    const supabase = createServerSupabaseClient()

    // 1. Check for duplicate incident within 15 minutes window
    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (supabase.from('system_errors' as any) as any)
      .select('id, timestamp')
      .eq('fingerprint', fingerprint)
      .gte('timestamp', fifteenMinsAgo)
      .maybeSingle()

    if (existing) {
      // Update existing incident timestamp instead of inserting duplicate alert row
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('system_errors' as any) as any)
        .update({ updated_at: new Date().toISOString() })
        .eq('id', existing.id)
      return existing.id
    }

    // 2. Insert fresh error record
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: inserted, error: insertErr } = await (supabase.from('system_errors' as any) as any)
      .insert({
        severity: options.severity,
        category: options.category,
        operation: options.operation,
        message: sanitizedMsg,
        template_key: options.templateKey || null,
        queue_id: options.queueId || null,
        resend_id: options.resendId || null,
        user_id: options.userId || null,
        fingerprint,
        status: 'new',
        details: options.details || {},
      })
      .select('id')
      .maybeSingle()

    if (insertErr) {
      console.warn('[logSystemError] DB insert failed (table may be pending migration):', insertErr.message)
    }

    // 3. Dispatch Admin In-App Notification for CRITICAL severity errors
    if (options.severity === 'critical') {
      try {
        const { data: adminUsers } = await supabase
          .from('users')
          .select('id')
          .eq('is_admin', true)

        const adminList = (adminUsers || []) as unknown as Array<{ id: string }>
        if (adminList.length > 0) {
          const { createInAppNotification } = await import('@/lib/notifications/in-app/service')
          for (const admin of adminList) {
            await createInAppNotification({
              userId: admin.id,
              category: 'security',
              title: `🚨 Critical Alert: ${options.category.toUpperCase()}`,
              body: `${options.operation}: ${sanitizedMsg}`,
              actionUrl: '/admin/system',
            }).catch(() => {})
          }
        }
      } catch (adminNotifErr) {
        console.warn('[logSystemError] Non-fatal admin notification failure:', adminNotifErr)
      }
    }

    return inserted?.id || null
  } catch (err) {
    console.warn('[logSystemError] Error logger invocation failed:', err)
    return null
  }
}
