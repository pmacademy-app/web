import { createBrowserSupabaseClient } from '@/lib/supabase'

/**
 * The one place logout happens on the client.
 *
 * Logging out is two independent network calls — revoking the Supabase session
 * and clearing the httpOnly cookies the server sets — and the earlier duplicated
 * implementations ran both inside a single `try` with the navigation at the end.
 * Two consequences followed (F-COR-6): a failing provider sign-out skipped the
 * cookie clear entirely, leaving a usable server-side session behind, and any
 * throw left the user sitting on an authenticated-looking page with no feedback.
 *
 * Here each step is settled on its own, navigation happens in `finally` so it
 * cannot be skipped, and the outcome is returned rather than swallowed.
 */

/** Learner-facing destination after logout. */
export const LEARNER_LOGIN_PATH = '/login'

/** Admin-console destination after logout. */
export const ADMIN_LOGIN_PATH = '/admin/login'

/** The subset of the Next.js router this helper needs, so it stays testable. */
export interface LogoutRouter {
  push: (href: string) => void
  refresh: () => void
}

export type LogoutStep = 'provider_sign_out' | 'session_cookie_clear'

export interface LogoutFailure {
  step: LogoutStep
  /** Short, non-sensitive reason. Never carries a token or a response body. */
  reason: string
}

export interface LogoutResult {
  /** True only when both the provider revocation and the cookie clear succeeded. */
  ok: boolean
  failures: LogoutFailure[]
}

export interface LogoutOptions {
  /**
   * Where to send the user afterwards. Must be an app-relative path; a
   * protocol-relative or absolute URL is rejected in favour of the learner
   * login page so a bad caller cannot turn logout into an open redirect.
   */
  redirectTo: string
}

const MAX_REASON_LENGTH = 200

function describe(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return raw.slice(0, MAX_REASON_LENGTH)
}

function safeDestination(redirectTo: string): string {
  if (!redirectTo.startsWith('/') || redirectTo.startsWith('//')) {
    return LEARNER_LOGIN_PATH
  }
  return redirectTo
}

/**
 * Signs the current user out and navigates to `redirectTo`.
 *
 * Navigation is guaranteed: it runs in `finally`, so an offline browser or a
 * failing auth provider still moves the user off the authenticated view.
 * Callers decide how to surface `failures` — the helper itself never throws.
 */
export async function logout(
  router: LogoutRouter,
  { redirectTo }: LogoutOptions
): Promise<LogoutResult> {
  const failures: LogoutFailure[] = []

  try {
    // 1. Revoke the browser-held Supabase session.
    try {
      const supabase = createBrowserSupabaseClient()
      const { error } = await supabase.auth.signOut()
      if (error) {
        failures.push({ step: 'provider_sign_out', reason: describe(error.message) })
      }
    } catch (err) {
      failures.push({ step: 'provider_sign_out', reason: describe(err) })
    }

    // 2. Clear the httpOnly server-side session cookies. This runs even when
    //    step 1 failed: the cookies are what the server actually trusts.
    try {
      const response = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sign_out', session: null }),
      })
      if (!response.ok) {
        // fetch only rejects on transport errors, so a 5xx would otherwise read
        // as a successful logout while the cookies are still set.
        failures.push({
          step: 'session_cookie_clear',
          reason: `server responded ${response.status}`,
        })
      }
    } catch (err) {
      failures.push({ step: 'session_cookie_clear', reason: describe(err) })
    }
  } finally {
    router.push(safeDestination(redirectTo))
    router.refresh()
  }

  return { ok: failures.length === 0, failures }
}

/** Formats a result for logging without leaking response bodies. */
export function formatLogoutFailures(result: LogoutResult): string {
  return result.failures.map((f) => `${f.step}: ${f.reason}`).join('; ')
}
