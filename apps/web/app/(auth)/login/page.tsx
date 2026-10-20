'use client'

import { useState, useTransition, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { BRAND } from '@/lib/brand'
import { BrandMarkProdily } from '@/components/brand/BrandLogo'
import { ResendVerificationCard } from '@/components/auth/ResendVerificationCard'
import { AuthErrorNotice } from '@/components/auth/AuthErrorNotice'
import { AuthSuccessNotice } from '@/components/auth/AuthSuccessNotice'
import { AuthHelpCard } from '@/components/auth/AuthHelpCard'
import { classifyAuthError, type ClassifiedAuthError, resolveApiAuthError } from '@/lib/auth/errors'
import { recordAuthTelemetry } from '@/lib/auth/telemetry'
import { GoogleButton } from '@/components/auth/GoogleButton'
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
  verification_failed: {
    code: 'AUTH_EMAIL_NOT_CONFIRMED',
    message: 'Your verification link has expired or was already used. Please request a new one below.',
    retryable: false,
    isNetworkError: false,
    requiresAction: 'verify_email',
  },
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

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const authErrorParam = searchParams.get('error')
  const resetSuccess = searchParams.get('reset') === 'success'
  const verifiedSuccess = searchParams.get('verified') === 'true'

  const [authError, setAuthError] = useState<ClassifiedAuthError | null>(() =>
    authErrorFromParam(authErrorParam)
  )
  const [attemptedEmail, setAttemptedEmail] = useState<string>('')
  const [isPending, startTransition] = useTransition()

  const {
    register,
    handleSubmit,
    getValues,
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
    setAttemptedEmail(values.email)

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
          requiresVerification?: boolean
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
          if (json.requiresVerification) {
            classified.requiresAction = 'verify_email'
            classified.code = 'AUTH_EMAIL_NOT_CONFIRMED'
          }
          setAuthError(classified)
          recordAuthTelemetry(classified, 'login')
          return
        }

        router.push(json.redirect || '/dashboard')
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
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
      {verifiedSuccess && (
        <AuthSuccessNotice>Your email address has been verified successfully! Please log in to continue.</AuthSuccessNotice>
      )}

      {resetSuccess && (
        <AuthSuccessNotice>Your password has been updated successfully! Please log in with your new password.</AuthSuccessNotice>
      )}

      {authError && (
        <div className="space-y-3">
          <AuthErrorNotice error={authError} />
          {authError.code === 'AUTH_EMAIL_NOT_CONFIRMED' && (
            <ResendVerificationCard email={attemptedEmail || getValues('email')} />
          )}
        </div>
      )}

      {GOOGLE_AUTH_ENABLED && (
        <>
          <div className="space-y-2">
            <GoogleButton href={buildGoogleStartHref({ next: searchParams.get('next') })} />
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
          href="/signup"
          className="font-semibold text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 rounded"
        >
          Sign up
        </Link>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <div className="container mx-auto px-4 py-16 max-w-sm">
      <div className="text-center mb-8 flex flex-col items-center">
        <a
          href="https://prodily.app"
          aria-label="Go to Prodily homepage"
          className="mb-4 inline-flex items-center justify-center rounded-lg transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <BrandMarkProdily size="md" />
        </a>
        <h1 className="text-2xl font-bold font-serif text-foreground mb-2">
          Welcome Back to {BRAND.fullName}
        </h1>
        <p className="text-xs text-muted-foreground">
          Log in to resume your learning path.
        </p>
      </div>

      <Suspense
        fallback={
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm text-center text-sm text-muted-foreground">
            Loading login form...
          </div>
        }
      >
        <LoginForm />
      </Suspense>

      <AuthHelpCard
        title="Having trouble signing in?"
        description="Facing an authentication or login issue? Email us and we'll help you out."
      />
    </div>
  )
}
