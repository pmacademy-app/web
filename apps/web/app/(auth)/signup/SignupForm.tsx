'use client'

import { useState, useTransition, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm, useWatch, type FieldErrors } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { classifyAuthError, type ClassifiedAuthError, resolveApiAuthError } from '@/lib/auth/errors'
import { AuthErrorNotice } from '@/components/auth/AuthErrorNotice'
import { recordAuthTelemetry } from '@/lib/auth/telemetry'
import { trackReferralSignupCompleted } from '@/lib/analytics'
import { TurnstileWidget, type TurnstileWidgetRef } from '@/components/auth/TurnstileWidget'
import { MINIMUM_SIGNUP_AGE } from '@/lib/legal/consent'
import { LegalConsentFields } from '@/components/auth/LegalConsentFields'
import { GoogleButton } from '@/components/auth/GoogleButton'
import { buildGoogleStartHref, isGoogleAuthEnabled } from '@/lib/auth/google-auth'

// Build-time inlined flag, so this is constant for the life of the bundle.
const GOOGLE_AUTH_ENABLED = isGoogleAuthEnabled()

const signupSchema = z.object({
  name: z
    .string()
    .min(1, 'Full name is required.')
    .min(2, 'Name must be at least 2 characters.')
    .max(80, 'Name must be less than 80 characters.')
    .trim(),
  email: z
    .string()
    .min(1, 'Email is required.')
    .email('Please enter a valid email address.')
    .trim()
    .toLowerCase(),
  password: z
    .string()
    .min(1, 'Password is required.')
    .min(6, 'Password must be at least 6 characters.'),
  // Mirrors the server schema in app/api/auth/signup/route.ts. The client copy is
  // for the inline error; the server's is the one that actually blocks the account.
  acceptedTerms: z.literal(true, {
    error: 'Please accept the Terms of Service and Privacy Policy to continue.',
  }),
  confirmedMinimumAge: z.literal(true, {
    error: `Please confirm you are at least ${MINIMUM_SIGNUP_AGE} years old to continue.`,
  }),
})

type SignupFormValues = z.infer<typeof signupSchema>

/**
 * Visual order of the fields. With Google enabled the consent boxes register (and
 * render) above the email form, so react-hook-form's built-in focus, which follows
 * registration order, would jump to Terms on a failed email submit. Focus follows the
 * email form instead; with the flag off this matches the old registration order.
 */
const FOCUS_ORDER: readonly (keyof SignupFormValues)[] = [
  'name',
  'email',
  'password',
  'acceptedTerms',
  'confirmedMinimumAge',
]

export interface SignupFormProps {
  /** Referral code from `?ref=`, forwarded to the signup API and the Google intent. */
  refCode?: string | null
  /**
   * Where to land after signup. Already passed through `sanitizeNextPath` by the
   * server page, so it is a same-origin path or null.
   */
  next?: string | null
}

/**
 * The interactive half of /signup. The page around it is a server component; this is
 * the only client boundary (form state, Turnstile, the Google consent gate).
 */
export default function SignupForm({ refCode = null, next = null }: SignupFormProps = {}) {
  const router = useRouter()

  const [authError, setAuthError] = useState<ClassifiedAuthError | null>(null)
  const [turnstileToken, setTurnstileToken] = useState<string>('')
  const [turnstileError, setTurnstileError] = useState<string | null>(null)
  const turnstileRef = useRef<TurnstileWidgetRef>(null)
  const [isPending, startTransition] = useTransition()

  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : '/login'

  const {
    register,
    handleSubmit,
    control,
    setFocus,
    formState: { errors },
  } = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    shouldFocusError: false,
    defaultValues: {
      name: '',
      email: '',
      password: '',
      // Unchecked by default and never pre-filled: a pre-ticked consent box is not
      // consent, and the zod literal below makes an unticked box a hard block.
      acceptedTerms: false as unknown as true,
      confirmedMinimumAge: false as unknown as true,
    },
  })

  // Google skips the email form, so both acknowledgements must already be ticked
  // before its button becomes usable. The server re-checks them via the signed intent.
  const [acceptedTermsValue, confirmedAgeValue] = useWatch({
    control,
    name: ['acceptedTerms', 'confirmedMinimumAge'],
  })

  const resetTurnstile = () => {
    turnstileRef.current?.reset()
    setTurnstileToken('')
  }

  const handleSignup = (values: SignupFormValues) => {
    setAuthError(null)

    if (!turnstileToken) {
      setTurnstileError('Please complete the security check above before submitting.')
      return
    }
    setTurnstileError(null)

    startTransition(async () => {
      try {
        const res = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...values, refCode, turnstileToken }),
        })

        if (res.status >= 502 && res.status <= 504) {
          resetTurnstile()
          const classified = classifyAuthError(new Error(`${res.status} Bad Gateway / Service Unavailable`), 'signup')
          setAuthError(classified)
          recordAuthTelemetry(classified, 'signup')
          return
        }

        let json: { success?: boolean; error?: string; code?: string; redirect?: string } = {}
        try {
          json = await res.json()
        } catch {
          resetTurnstile()
          const classified = classifyAuthError(new Error(`HTTP ${res.status}: Invalid server response`), 'signup')
          setAuthError(classified)
          recordAuthTelemetry(classified, 'signup')
          return
        }

        if (!res.ok || !json.success) {
          resetTurnstile()
          // SIGNUPS_DISABLED is a known platform-control response, not an auth error
          if (res.status === 403 && (json.code === 'SIGNUPS_DISABLED' || json.error?.toLowerCase().includes('registrations are currently closed'))) {
            setAuthError({
              code: 'AUTH_UNKNOWN_ERROR',
              message: json.error || 'New learner registrations are currently closed. Please check back later.',
              retryable: false,
              isNetworkError: false,
            })
            return
          }
          const classified = resolveApiAuthError(json, 'signup', 'Registration failed')
          setAuthError(classified)
          recordAuthTelemetry(classified, 'signup')
          return
        }

        if (refCode) trackReferralSignupCompleted()

        // The API answers `/login` when no session could be attached (an existing
        // account, or the post-create sign-in failed). Keep `next` on that hop so the
        // learner still lands on the lesson they came for after logging in.
        const apiRedirect = json.redirect || '/dashboard'
        const destination = apiRedirect === '/login' ? loginHref : next ?? apiRedirect
        router.push(destination)
        router.refresh()
      } catch (err) {
        resetTurnstile()
        console.error('[signup] Error registering:', err)
        const classified = classifyAuthError(err, 'signup')
        setAuthError(classified)
        recordAuthTelemetry(classified, 'signup')
      }
    })
  }

  // Stable identities. The widget's render effect depends on these props, so a new
  // function on every parent render would tear the widget down and re-render it,
  // and because a fresh widget solves and calls back with a NEW token, that cycle
  // never settles. Only the setters are referenced, and React guarantees those are
  // stable, so there is no stale closure to worry about. They are listed as deps only
  // so the React Compiler can verify the memoization; listing them changes nothing.
  const handleTurnstileSuccess = useCallback((token: string) => {
    setTurnstileToken(token)
    setTurnstileError(null)
  }, [setTurnstileToken, setTurnstileError])

  const handleTurnstileExpire = useCallback(() => {
    setTurnstileToken('')
    setTurnstileError('Security verification expired. Please complete the check again.')
  }, [setTurnstileToken, setTurnstileError])

  const handleTurnstileError = useCallback(() => {
    setTurnstileToken('')
  }, [setTurnstileToken])

  const focusFirstError = (fieldErrors: FieldErrors<SignupFormValues>) => {
    const first = FOCUS_ORDER.find((name) => fieldErrors[name])
    if (first) setFocus(first)
  }

  const onFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    handleSubmit(handleSignup, focusFirstError)(e)
  }

  const isLoading = isPending

  const googleConsentGiven = acceptedTermsValue === true && confirmedAgeValue === true
  const googleHref = buildGoogleStartHref({
    consent: true,
    ref: refCode,
    next,
  })

  const consentFields = (
    <LegalConsentFields
      termsInputProps={register('acceptedTerms')}
      ageInputProps={register('confirmedMinimumAge')}
      termsError={errors.acceptedTerms?.message}
      ageError={errors.confirmedMinimumAge?.message}
      disabled={isLoading}
    />
  )

  return (
    <>
      {authError && (
        <AuthErrorNotice error={authError}>
          {(authError.code === 'AUTH_USER_ALREADY_EXISTS' || authError.requiresAction === 'login') && (
            <Link
              href={loginHref}
              className="inline-flex w-fit items-center gap-1 font-bold text-primary underline underline-offset-2 hover:opacity-80"
            >
              Go to Login
            </Link>
          )}
        </AuthErrorNotice>
      )}

      {GOOGLE_AUTH_ENABLED && (
        <>
          {consentFields}

          <div className="space-y-2">
            <GoogleButton
              href={googleHref}
              disabled={!googleConsentGiven || isLoading}
              aria-describedby={googleConsentGiven ? undefined : 'google-consent-hint'}
            />
            {!googleConsentGiven && (
              <p id="google-consent-hint" className="text-center text-[11px] leading-relaxed text-muted-foreground">
                Tick both boxes above to continue with Google.
              </p>
            )}
          </div>

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" aria-hidden="true" />
            <span>or sign up with email</span>
            <span className="h-px flex-1 bg-border" aria-hidden="true" />
          </div>
        </>
      )}

      <form onSubmit={onFormSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="signup-name" className="block text-xs font-semibold uppercase text-foreground/80 mb-1">
            Full Name
          </label>
          <Input
            id="signup-name"
            type="text"
            autoComplete="name"
            required
            disabled={isLoading}
            error={!!errors.name}
            aria-describedby={errors.name ? 'name-error' : undefined}
            placeholder="Jane Doe"
            {...register('name')}
          />
          {errors.name && (
            <p id="name-error" className="mt-1 text-xs text-destructive font-medium" role="alert">
              {errors.name.message}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="signup-email" className="block text-xs font-semibold uppercase text-foreground/80 mb-1">
            Email Address
          </label>
          <Input
            id="signup-email"
            type="email"
            autoComplete="email"
            required
            disabled={isLoading}
            error={!!errors.email}
            aria-describedby={errors.email ? 'email-error' : undefined}
            placeholder="jane@example.com"
            {...register('email')}
          />
          {errors.email && (
            <p id="email-error" className="mt-1 text-xs text-destructive font-medium" role="alert">
              {errors.email.message}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="signup-password" className="block text-xs font-semibold uppercase text-foreground/80 mb-1">
            Password
          </label>
          <Input
            id="signup-password"
            type="password"
            autoComplete="new-password"
            required
            disabled={isLoading}
            error={!!errors.password}
            aria-describedby={errors.password ? 'password-error' : undefined}
            placeholder="Min. 6 characters"
            {...register('password')}
          />
          {errors.password && (
            <p id="password-error" className="mt-1 text-xs text-destructive font-medium" role="alert">
              {errors.password.message}
            </p>
          )}
        </div>

        {!GOOGLE_AUTH_ENABLED && consentFields}

        <div className="py-1">
          <TurnstileWidget
            ref={turnstileRef}
            onSuccess={handleTurnstileSuccess}
            onExpire={handleTurnstileExpire}
            onError={handleTurnstileError}
          />
          {turnstileError && (
            <p className="mt-1 text-xs text-destructive font-medium text-center" role="alert">
              {turnstileError}
            </p>
          )}
        </div>

        <Button
          type="submit"
          loading={isPending}
          disabled={isLoading}
          className="w-full"
        >
          {isPending ? 'Submitting...' : 'Create Account →'}
        </Button>
      </form>

      <div className="mt-6 text-center text-xs text-muted-foreground border-t border-border pt-4">
        Already have an account?{' '}
        <Link
          href={loginHref}
          className="font-semibold text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 rounded"
        >
          Log in
        </Link>
      </div>
    </>
  )
}
