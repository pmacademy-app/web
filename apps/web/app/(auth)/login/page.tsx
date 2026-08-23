'use client'

import { useState, useTransition, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { BRAND } from '@/lib/brand'
import { BrandMarkProdily } from '@/components/brand/BrandLogo'
import { ResendVerificationCard } from '@/components/auth/ResendVerificationCard'
import { AuthHelpCard } from '@/components/auth/AuthHelpCard'
import { classifyAuthError, type ClassifiedAuthError } from '@/lib/auth/errors'

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

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const authErrorParam = searchParams.get('error')

  const [authError, setAuthError] = useState<ClassifiedAuthError | null>(
    authErrorParam === 'auth_failed'
      ? {
          code: 'AUTH_INVALID_CREDENTIALS',
          message: 'Authentication failed. Please try again.',
          retryable: true,
          isNetworkError: false,
        }
      : null
  )
  const [isPending, startTransition] = useTransition()

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
        const supabase = createBrowserSupabaseClient()
        const { data, error } = await supabase.auth.signInWithPassword({
          email: values.email,
          password: values.password,
        })

        if (error) {
          const classified = classifyAuthError(error, 'login')
          setAuthError(classified)
          return
        }

        // Explicitly sync session to HTTP-only cookies BEFORE navigating.
        // This eliminates the race condition where the server renders /dashboard
        // before AuthStateListener writes the cookie.
        if (data?.session) {
          try {
            const syncRes = await fetch('/api/auth/session', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ session: data.session }),
            })
            if (!syncRes.ok) {
              const syncError = classifyAuthError(new Error('Session initialization failed'), 'session_sync')
              setAuthError(syncError)
              return
            }
          } catch (syncErr) {
            console.error('[login] Session sync network error:', syncErr)
            const syncError = classifyAuthError(syncErr, 'session_sync')
            setAuthError(syncError)
            return
          }
        }

        router.push('/dashboard')
        router.refresh()
      } catch (err) {
        console.error('[login] Error logging in:', err)
        const classified = classifyAuthError(err, 'login')
        setAuthError(classified)
      }
    })
  }

  const isLoading = isPending

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">

      {authError && (
        <div className="space-y-3">
          <div
            className="p-3 text-xs rounded-lg bg-destructive/10 border border-destructive/20 text-destructive font-medium"
            role="alert"
          >
            {authError.message}
          </div>
          {authError.code === 'AUTH_EMAIL_NOT_CONFIRMED' && (
            <ResendVerificationCard />
          )}
        </div>
      )}

      <form onSubmit={handleSubmit(handleEmailLogin)} className="space-y-4" noValidate>
        <div>
          <label htmlFor="login-email" className="block text-xs font-semibold uppercase text-foreground/80 mb-1">
            Email Address
          </label>
          <input
            id="login-email"
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
          <input
            id="login-password"
            type="password"
            required
            disabled={isLoading}
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? 'password-error' : undefined}
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
          {isPending ? 'Logging in...' : 'Log In'}
        </button>
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
          href="https://prodily.adityagangwani.me"
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
