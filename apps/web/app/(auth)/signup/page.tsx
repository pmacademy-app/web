'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Mail, CheckCircle2, Clock, ShieldCheck } from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { BrandMarkProdily } from '@/components/brand/BrandLogo'
import { AuthHelpCard } from '@/components/auth/AuthHelpCard'
import { ResendVerificationCard } from '@/components/auth/ResendVerificationCard'
import { classifyAuthError, type ClassifiedAuthError } from '@/lib/auth/errors'
import { recordAuthTelemetry } from '@/lib/auth/telemetry'

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

export default function SignupPage() {
  const router = useRouter()
  const [authError, setAuthError] = useState<ClassifiedAuthError | null>(null)
  const [submittedEmail, setSubmittedEmail] = useState<string>('')
  const [verificationPending, setVerificationPending] = useState<boolean>(false)
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

    startTransition(async () => {
      try {
        const supabase = createBrowserSupabaseClient()
        const origin = window.location.origin

        const { data, error } = await supabase.auth.signUp({
          email: values.email,
          password: values.password,
          options: {
            data: { full_name: values.name },
            // token_hash + type are appended by Supabase; next= tells our callback where to redirect
            emailRedirectTo: `${origin}/api/auth/callback?next=/verified`,
          },
        })

        const isExistingAccountError =
          Boolean(error && (
            error.message?.toLowerCase().includes('already registered') ||
            error.message?.toLowerCase().includes('already in use') ||
            error.message?.toLowerCase().includes('already exists')
          )) ||
          Boolean(data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0)

        if (isExistingAccountError) {
          const classified = classifyAuthError(new Error('User already registered'), 'signup')
          setAuthError(classified)
          recordAuthTelemetry(classified, 'signup')
          return
        }

        if (error) {
          const classified = classifyAuthError(error, 'signup')
          setAuthError(classified)
          recordAuthTelemetry(classified, 'signup')
          return
        }

        // If email confirmation is disabled, user is immediately logged in
        if (data.session) {
          router.push('/dashboard')
          router.refresh()
        } else {
          setSubmittedEmail(values.email)
          setVerificationPending(true)
        }
      } catch (err) {
        console.error('[signup] Error registering:', err)
        const classified = classifyAuthError(err, 'signup')
        setAuthError(classified)
        recordAuthTelemetry(classified, 'signup')
      }
    })
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
            <button
              type="button"
              onClick={() => {
                setVerificationPending(false)
                setSubmittedEmail('')
              }}
              className="text-xs text-primary font-semibold hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded p-1 cursor-pointer"
            >
              Entered the wrong email? Sign up again with a different address →
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
          {authError && (
            <div
              className="p-3 text-xs rounded-lg bg-destructive/10 border border-destructive/20 text-destructive font-medium flex flex-col gap-1.5"
              role="alert"
            >
              <span>{authError.message}</span>
              {(authError.code === 'AUTH_USER_ALREADY_EXISTS' || authError.requiresAction === 'login') && (
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1 font-bold underline hover:opacity-80 text-primary w-fit"
                >
                  Go to Login →
                </Link>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit(handleSignup)} className="space-y-4" noValidate>
            <div>
              <label htmlFor="signup-name" className="block text-xs font-semibold uppercase text-foreground/80 mb-1">
                Full Name
              </label>
              <input
                id="signup-name"
                type="text"
                required
                disabled={isLoading}
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? 'name-error' : undefined}
                placeholder="Jane Doe"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:border-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed outline-none"
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
              <input
                id="signup-email"
                type="email"
                required
                disabled={isLoading}
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? 'email-error' : undefined}
                placeholder="jane@example.com"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:border-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed outline-none"
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
              <input
                id="signup-password"
                type="password"
                required
                disabled={isLoading}
                aria-invalid={!!errors.password}
                aria-describedby={errors.password ? 'password-error' : undefined}
                placeholder="Min. 6 characters"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:border-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed outline-none"
                {...register('password')}
              />
              {errors.password && (
                <p id="password-error" className="mt-1 text-xs text-destructive font-medium" role="alert">
                  {errors.password.message}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? 'Submitting...' : 'Create Account →'}
            </button>
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

