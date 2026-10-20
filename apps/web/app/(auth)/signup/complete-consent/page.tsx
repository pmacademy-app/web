'use client'

import { Suspense, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { BrandMarkProdily } from '@/components/brand/BrandLogo'
import { AuthErrorNotice } from '@/components/auth/AuthErrorNotice'
import { AuthHelpCard } from '@/components/auth/AuthHelpCard'
import { LegalConsentFields } from '@/components/auth/LegalConsentFields'
import { apiPost } from '@/lib/api/client'
import { LEARNER_LOGIN_PATH, logout } from '@/lib/auth/logout'

/**
 * Consent gate for new Google accounts.
 *
 * Google sign-in from the login page skips the signup form, so the Terms/Privacy and
 * minimum-age acknowledgements are collected here instead. The proxy keeps a Google
 * account with no recorded consent on this page until it accepts or declines. The
 * server records the timestamp and document versions; the client only sends the
 * decision, so nothing here can backdate or forge consent.
 */

const COMPLETE_CONSENT_PATH = '/api/auth/complete-consent'

type ConsentDecision = 'accept' | 'decline'

interface CompleteConsentResponse {
  success: boolean
  redirect: string
  deleted?: boolean
}

interface GateError {
  message: string
  errorId?: string
}

/**
 * The server already sanitizes `redirect`. Checking again costs nothing and means a
 * misbehaving response can never send the browser off-origin.
 */
function safeRedirect(target: unknown, fallback: string): string {
  if (typeof target !== 'string') return fallback
  if (!target.startsWith('/') || target.startsWith('//') || target.includes('\\')) return fallback
  return target
}

function CompleteConsentContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next')

  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [confirmedAge, setConfirmedAge] = useState(false)
  const [confirmingDecline, setConfirmingDecline] = useState(false)
  const [pendingDecision, setPendingDecision] = useState<ConsentDecision | null>(null)
  const [error, setError] = useState<GateError | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)
  const [isPending, startTransition] = useTransition()

  const busy = isPending || pendingDecision !== null || loggingOut
  const bothTicked = acceptedTerms && confirmedAge

  // Always available, so nobody is stuck here if the consent route is unavailable or
  // rate limited. Consent stays unrecorded and the gate shows again on the next sign-in.
  const handleLogout = async () => {
    if (loggingOut) return
    setLoggingOut(true)
    await logout(router, { redirectTo: LEARNER_LOGIN_PATH })
  }

  const submit = (decision: ConsentDecision) => {
    if (busy) return
    if (decision === 'accept' && !bothTicked) return
    setError(null)
    setPendingDecision(decision)

    startTransition(async () => {
      const result = await apiPost<CompleteConsentResponse>(COMPLETE_CONSENT_PATH, {
        decision,
        ...(next ? { next } : {}),
      })

      if (!result.ok) {
        // An expired session cannot finish the gate. Start the sign-in again.
        if (result.error.status === 401) {
          router.replace('/login')
          return
        }
        setError({ message: result.error.message, errorId: result.error.errorId })
        setPendingDecision(null)
        return
      }

      if (!result.data.success) {
        setError({ message: 'We could not save your choice. Please try again.' })
        setPendingDecision(null)
        return
      }

      // A full navigation, not a client transition: the session cookies and the
      // proxy's view of this account have just changed, so every layout must reload.
      const fallback = decision === 'accept' ? '/dashboard' : '/login'
      window.location.assign(safeRedirect(result.data.redirect, fallback))
    })
  }

  return (
    <div className="container mx-auto px-4 py-16 max-w-sm">
      <div className="text-center mb-8 flex flex-col items-center">
        <span className="mb-4 inline-flex items-center justify-center">
          <BrandMarkProdily size="md" />
        </span>
        <h1 className="text-2xl font-bold font-serif text-foreground mb-2">One Last Step</h1>
        <p className="text-xs text-muted-foreground leading-relaxed">
          You signed in with Google. Before you start learning, please confirm the two points
          below.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
        {error && <AuthErrorNotice error={error} />}

        <LegalConsentFields
          termsInputProps={{
            checked: acceptedTerms,
            onChange: (event) => setAcceptedTerms(event.target.checked),
          }}
          ageInputProps={{
            checked: confirmedAge,
            onChange: (event) => setConfirmedAge(event.target.checked),
          }}
          disabled={busy}
        />

        <div className="space-y-2">
          <Button
            type="button"
            className="w-full"
            onClick={() => submit('accept')}
            disabled={!bothTicked || busy}
            loading={pendingDecision === 'accept'}
            aria-describedby={bothTicked ? undefined : 'consent-gate-hint'}
          >
            {pendingDecision === 'accept' ? 'Saving...' : 'Agree and Continue'}
          </Button>
          {!bothTicked && (
            <p id="consent-gate-hint" className="text-center text-[11px] leading-relaxed text-muted-foreground">
              Tick both boxes above to continue.
            </p>
          )}
        </div>

        <div className="border-t border-border pt-4 space-y-3">
          {confirmingDecline ? (
            <div className="space-y-3" role="group" aria-labelledby="consent-decline-title">
              <p id="consent-decline-title" className="text-xs leading-relaxed text-foreground">
                <strong className="font-semibold">Delete your new account?</strong> We will delete the
                account we just created for you and log you out. If it already has learning
                activity, we only log you out. You can sign up again at any time.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="destructive-subtle"
                  size="sm"
                  className="flex-1"
                  onClick={() => submit('decline')}
                  disabled={busy}
                  loading={pendingDecision === 'decline'}
                >
                  {pendingDecision === 'decline' ? 'Deleting...' : 'Yes, delete my account'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => setConfirmingDecline(false)}
                  disabled={busy}
                >
                  Go back
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center">
              <Button
                type="button"
                variant="link"
                size="sm"
                onClick={() => setConfirmingDecline(true)}
                disabled={busy}
                className="text-xs text-muted-foreground hover:text-destructive"
              >
                Cancel and delete my new account
              </Button>
            </div>
          )}
        </div>

        <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
          Not ready to decide?{' '}
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={handleLogout}
            disabled={busy}
            className="h-auto p-0 text-[11px]"
          >
            {loggingOut ? 'Logging out...' : 'Log out'}
          </Button>
        </p>
      </div>

      <AuthHelpCard
        title="Questions before you agree?"
        description="Email us and we'll help with anything about our Terms or how we handle your data."
      />
    </div>
  )
}

export default function CompleteConsentPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto px-4 py-16 max-w-sm">
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm text-center text-sm text-muted-foreground">
            Loading...
          </div>
        </div>
      }
    >
      <CompleteConsentContent />
    </Suspense>
  )
}
