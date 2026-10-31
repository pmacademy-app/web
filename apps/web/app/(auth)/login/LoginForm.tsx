'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AuthErrorNotice } from '@/components/auth/AuthErrorNotice'
import { AuthSuccessNotice } from '@/components/auth/AuthSuccessNotice'
import { classifyAuthError, type ClassifiedAuthError, resolveApiAuthError } from '@/lib/auth/errors'
import { recordAuthTelemetry } from '@/lib/auth/telemetry'
import { GoogleButton } from '@/components/auth/GoogleButton'
import { ResendVerificationCard } from '@/components/auth/ResendVerificationCard'
import { buildGoogleStartHref, isGoogleAuthEnabled } from '@/lib/auth/google-auth'

// Build-time inlined flag, so this is constant for the life of the bundle.
const GOOGLE_AUTH_ENABLED = isGoogleAuthEnabled()

const loginSchema = z.object({
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
})

type LoginFormValues = z.infer<typeof loginSchema>

const nonRetryable = (code: ClassifiedAuthError['code'], message: string): ClassifiedAuthError => ({
  code,
  message,
  retryable: false,
  isNetworkError: false,
})

/**
 * Plain-language copy for the `?error=` codes the auth callback and the Google start
 * route redirect here with. Unknown codes show nothing rather than a vague failure.
 */
const LOGIN_ERROR_PARAMS: Record<string, ClassifiedAuthError> = {
  auth_failed: {
    code: 'AUTH_INVALID_CREDENTIALS',
    message: 'Authentication failed. Please try again.',
    retryable: true,
    isNetworkError: false,
  },
  verification_failed: nonRetryable(
    'AUTH_UNKNOWN_ERROR',
    'That verification link has expired or was already used. Log in below, or request a new link.'
  ),
  // app/(app)/layout.tsx and proxy.ts redirect here when verification is required and
  // the session's email is unconfirmed. The resend card renders below this notice.
  email_not_confirmed: nonRetryable(
    'AUTH_EMAIL_NOT_CONFIRMED',
    'Please confirm your email first. Check your inbox for the link, or resend it below.'
  ),
  oauth_cancelled: nonRetryable(
    'AUTH_UNKNOWN_ERROR',
    'Google sign-in was cancelled. You can try again or log in with your email.'
  ),
  oauth_failed: {
    code: 'AUTH_PROVIDER_UNAVAILABLE',
    message: 'We could not sign you in with Google. Please try again.',
    retryable: true,
    isNetworkError: false,
  },
  oauth_rate_limited: {
    code: 'AUTH_RATE_LIMITED',
    message: 'Too many sign-in attempts. Please wait a few minutes and try again.',
    retryable: true,
    isNetworkError: false,
  },
  oauth_unavailable: nonRetryable(
    'AUTH_PROVIDER_UNAVAILABLE',
    'Google sign-in is not available right now. Please log in with your email instead.'
  ),
  signups_closed: nonRetryable(
    'AUTH_UNKNOWN_ERROR',
    'New learner registrations are currently closed. Please check back later.'
  ),
  signup_limited: nonRetryable(
    'AUTH_RATE_LIMITED',
    'We are getting a lot of new signups right now. Please try again in an hour.'
  ),
  oauth_admin_blocked: nonRetryable(
    'AUTH_UNKNOWN_ERROR',
    'Admin accounts must sign in with email and password.'
  ),
  consent_declined: nonRetryable(
    'AUTH_UNKNOWN_ERROR',
    'You need to accept the Terms and confirm your age to continue. You have been signed out.'
  ),
}

function authErrorFromParam(param: string | null): ClassifiedAuthError | null {
  if (!param || !Object.prototype.hasOwnProperty.call(LOGIN_ERROR_PARAMS, param)) return null
  return { ...LOGIN_ERROR_PARAMS[param] }
}

export interface LoginFormProps {
  /**
   * Where to land after login. Already passed through `sanitizeNextPath` by the
   * server page, so it is a same-origin path or null.
   */
  next: string | null
  /** Raw `?error=` code; only known codes render copy. */
  errorParam: string | null
  /** `?verified=true` from the email-link callback. */
  verified: boolean
  /** `?reset=success` after a password reset. */
  resetSuccess: boolean
}

/**
 * The interactive half of /login. The page around it is a server component; this is
 * the only client boundary.
 */
export default function LoginForm({ next, errorParam, verified, resetSuccess }: LoginFormProps) {
  const router = useRouter()

  const [authError, setAuthError] = useState<ClassifiedAuthError | null>(() =>
    authErrorFromParam(errorParam)
  )
  const [isPending, startTransition] = useTransition()

  const signupHref = next ? `/signup?next=${encodeURIComponent(next)}` : '/signup'

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  })

  const handleEmailLogin = (values: LoginFormValues) => {
    setAuthError(null)

    startTransition(async () => {
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(values),
        })

        if (res.status >= 502 && res.status <= 504) {
          const classified = classifyAuthError(new Error(`${res.status} Bad Gateway / Service Unavailable`), 'login')
          setAuthError(classified)
          recordAuthTelemetry(classified, 'login')
          return
        }

        let json: {
          success?: boolean
          error?: string
          code?: string
          errorId?: string
          redirect?: string
        } = {}
        try {
          json = await res.json()
        } catch {
          const classified = classifyAuthError(new Error(`HTTP ${res.status}: Invalid server response`), 'login')
          setAuthError(classified)
          recordAuthTelemetry(classified, 'login')
          return
        }

        if (!res.ok || !json.success) {
          // Prefer the server's stable code over re-deriving one from the message.
          const classified = resolveApiAuthError(json, 'login', 'Authentication failed')
          setAuthError(classified)
          recordAuthTelemetry(classified, 'login')
          return
        }

        router.push(next ?? (json.redirect || '/dashboard'))
        router.refresh()
      } catch (err) {
        console.error('[login] Error logging in:', err)
        const classified = classifyAuthError(err, 'login')
        setAuthError(classified)
        recordAuthTelemetry(classified, 'login')
      }
    })
  }

  const isLoading = isPending

  return (
    <>
      {verified && (
        <AuthSuccessNotice>Your email address has been verified successfully! Please log in to continue.</AuthSuccessNotice>
      )}

      {resetSuccess && (
        <AuthSuccessNotice>Your password has been updated successfully! Please log in with your new password.</AuthSuccessNotice>
      )}

      {authError && <AuthErrorNotice error={authError} />}

      {/* The notice says "resend it below"; this is the "below". */}
      {authError?.code === 'AUTH_EMAIL_NOT_CONFIRMED' && <ResendVerificationCard />}

      {GOOGLE_AUTH_ENABLED && (
        <>
          <div className="space-y-2">
            <GoogleButton href={buildGoogleStartHref({ next })} />
            <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
              New here? You&apos;ll confirm our Terms and age on the next step.
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" aria-hidden="true" />
            <span>or log in with email</span>
            <span className="h-px flex-1 bg-border" aria-hidden="true" />
          </div>
        </>
      )}

      <form onSubmit={handleSubmit(handleEmailLogin)} className="space-y-4" noValidate>
        <div>
          <label htmlFor="login-email" className="block text-xs font-semibold uppercase text-foreground/80 mb-1">
            Email Address
          </label>
          <Input
            id="login-email"
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
          <div className="flex justify-between items-center mb-1">
            <label htmlFor="login-password" className="block text-xs font-semibold uppercase text-foreground/80">
              Password
            </label>
            <Link
              href="/reset-password"
              className="text-xs text-primary font-medium hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 rounded"
            >
              Forgot?
            </Link>
          </div>
          <Input
            id="login-password"
            type="password"
            autoComplete="current-password"
            required
            disabled={isLoading}
            error={!!errors.password}
            aria-describedby={errors.password ? 'password-error' : undefined}
            {...register('password')}
          />
          {errors.password && (
            <p id="password-error" className="mt-1 text-xs text-destructive font-medium" role="alert">
              {errors.password.message}
            </p>
          )}
        </div>

        <Button
          type="submit"
          loading={isPending}
          disabled={isLoading}
          className="w-full"
        >
          {isPending ? 'Logging in...' : 'Log In'}
        </Button>
      </form>

      <div className="mt-6 text-center text-xs text-muted-foreground border-t border-border pt-4">
        Don&apos;t have an account?{' '}
        <Link
          href={signupHref}
          className="font-semibold text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 rounded"
        >
          Sign up
        </Link>
      </div>
    </>
  )
}
