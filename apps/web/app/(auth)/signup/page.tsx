'use client'

import { useState, useTransition, Suspense, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Mail, CheckCircle2, Clock, ShieldCheck } from 'lucide-react'
import { BrandMarkProdily } from '@/components/brand/BrandLogo'
import { AuthHelpCard } from '@/components/auth/AuthHelpCard'
import { ResendVerificationCard } from '@/components/auth/ResendVerificationCard'
import { ReferralBadge } from '@/components/referral/ReferralBadge'
import { classifyAuthError, type ClassifiedAuthError, resolveApiAuthError } from '@/lib/auth/errors'
import { AuthErrorNotice } from '@/components/auth/AuthErrorNotice'
import { recordAuthTelemetry } from '@/lib/auth/telemetry'
import { trackReferralSignupCompleted } from '@/lib/analytics'
import { TurnstileWidget, type TurnstileWidgetRef } from '@/components/auth/TurnstileWidget'

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
})

type SignupFormValues = z.infer<typeof signupSchema>

function SignupFormContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const refCode = searchParams.get('ref')

  const [authError, setAuthError] = useState<ClassifiedAuthError | null>(null)
  const [submittedEmail, setSubmittedEmail] = useState<string>('')
  const [verificationPending, setVerificationPending] = useState<boolean>(false)
  const [turnstileToken, setTurnstileToken] = useState<string>('')
  const [turnstileError, setTurnstileError] = useState<string | null>(null)
  const turnstileRef = useRef<TurnstileWidgetRef>(null)
  const [isPending, startTransition] = useTransition()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
    },
  })

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
          turnstileRef.current?.reset()
          setTurnstileToken('')
          const classified = classifyAuthError(new Error(`${res.status} Bad Gateway / Service Unavailable`), 'signup')
          setAuthError(classified)
          recordAuthTelemetry(classified, 'signup')
          return
        }

        let json: { success?: boolean; error?: string; verificationRequired?: boolean; redirect?: string } = {}
        try {
          json = await res.json()
        } catch {
          turnstileRef.current?.reset()
          setTurnstileToken('')
          const classified = classifyAuthError(new Error(`HTTP ${res.status}: Invalid server response`), 'signup')
          setAuthError(classified)
          recordAuthTelemetry(classified, 'signup')
          return
        }

        if (!res.ok || !json.success) {
          turnstileRef.current?.reset()
          setTurnstileToken('')
          // SIGNUPS_DISABLED is a known platform-control response, not an auth error
          if (res.status === 403 && ((json as { code?: string }).code === 'SIGNUPS_DISABLED' || json.error?.toLowerCase().includes('registrations are currently closed'))) {
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

        if (json.verificationRequired) {
          if (refCode) trackReferralSignupCompleted()
          setSubmittedEmail(values.email)
          setVerificationPending(true)
        } else {
          if (refCode) trackReferralSignupCompleted()
          router.push(json.redirect || '/dashboard')
          router.refresh()
        }
      } catch (err) {
        turnstileRef.current?.reset()
        setTurnstileToken('')
        console.error('[signup] Error registering:', err)
        const classified = classifyAuthError(err, 'signup')
        setAuthError(classified)
        recordAuthTelemetry(classified, 'signup')
      }
    })
  }

  // Stable identities. The widget's render effect depends on these props, so a new
  // function on every parent render would tear the widget down and re-render it —
  // and because a fresh widget solves and calls back with a NEW token, that cycle
  // never settles. Only the setters are referenced, and React guarantees those are
  // stable, so there is no stale closure to worry about.
  const handleTurnstileSuccess = useCallback((token: string) => {
    setTurnstileToken(token)
    setTurnstileError(null)
  }, [])

  const handleTurnstileExpire = useCallback(() => {
    setTurnstileToken('')
    setTurnstileError('Security verification expired. Please complete the check again.')
  }, [])

  const handleTurnstileError = useCallback(() => {
    setTurnstileToken('')
  }, [])

  const onFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    handleSubmit(handleSignup)(e)
  }

  const isLoading = isPending

  return (
    <div className="container mx-auto px-4 py-16 max-w-sm">
      <div className="text-center mb-8 flex flex-col items-center">
        <a
          href="https://prodily.adityagangwani.me"
          aria-label="Go to Prodily homepage"
          className="mb-4 inline-flex items-center justify-center rounded-lg transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <BrandMarkProdily size="md" />
        </a>
        <h1 className="text-2xl font-bold font-serif text-foreground mb-2">
          {verificationPending ? 'Verification Required' : 'Create Your Free Account'}
        </h1>
        <p className="text-xs text-muted-foreground">
          90 lessons. 9 modules. Always free.
        </p>
      </div>

      <ReferralBadge refCode={refCode} />

      {verificationPending ? (
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-5">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-1">
              <Mail className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold font-serif text-foreground">
              Check Your Email to Verify Your Account
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              We sent a verification link to <strong className="text-foreground font-semibold">{submittedEmail}</strong>.
            </p>
          </div>

          {/* Verification Pipeline Progress */}
          <div className="p-3 rounded-lg bg-secondary/50 border border-border space-y-2 text-xs">
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-medium">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Signup request received</span>
            </div>
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-semibold">
              <Clock className="w-4 h-4 shrink-0 animate-pulse" />
              <span>Email verification pending</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>Account ready after email confirmation</span>
            </div>
          </div>

          {/* Guidelines and Bounce Notice */}
          <div className="text-xs text-muted-foreground space-y-2 bg-muted/40 p-3 rounded-lg border border-border/60">
            <p className="font-semibold text-foreground">Next steps:</p>
            <ul className="list-disc list-inside space-y-1 text-[11px] leading-relaxed">
              <li>Click the link in the email to activate your account.</li>
              <li>Check your <strong>spam or junk folder</strong> if it does not appear within a few minutes.</li>
              <li>
                <strong>If you mistyped your email address</strong>, you will not receive the confirmation email.
              </li>
            </ul>
          </div>

          {/* Resend Verification Email Control */}
          <ResendVerificationCard email={submittedEmail} />

          {/* Reset / Change Email Link */}
          <div className="pt-2 text-center border-t border-border">
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={() => {
                setVerificationPending(false)
                setSubmittedEmail('')
                setTurnstileToken('')
                setTurnstileError(null)
                turnstileRef.current?.reset()
              }}
              className="text-xs text-primary font-semibold hover:underline p-1 h-auto"
            >
              Entered the wrong email? Sign up again with a different address →
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
          {authError && (
            <AuthErrorNotice error={authError}>
              {(authError.code === 'AUTH_USER_ALREADY_EXISTS' || authError.requiresAction === 'login') && (
                <Link
                  href="/login"
                  className="inline-flex w-fit items-center gap-1 font-bold text-primary underline underline-offset-2 hover:opacity-80"
                >
                  Go to Login
                </Link>
              )}
            </AuthErrorNotice>
          )}

          <form onSubmit={onFormSubmit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="signup-name" className="block text-xs font-semibold uppercase text-foreground/80 mb-1">
                Full Name
              </label>
              <Input
                id="signup-name"
                type="text"
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
              href="/login"
              className="font-semibold text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 rounded"
            >
              Log in
            </Link>
          </div>
        </div>
      )}

      <AuthHelpCard
        title="Having trouble creating your account?"
        description="If you run into an issue during registration, email us and we'll help you out."
      />
    </div>
  )
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto px-4 py-16 max-w-sm">
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm text-center text-sm text-muted-foreground">
            Loading signup...
          </div>
        </div>
      }
    >
      <SignupFormContent />
    </Suspense>
  )
}


