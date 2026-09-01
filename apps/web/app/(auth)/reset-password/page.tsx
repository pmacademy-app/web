'use client'

import { useState, useTransition, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Eye, EyeOff, CheckCircle2, KeyRound, AlertCircle } from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { BrandMarkProdily } from '@/components/brand/BrandLogo'
import { classifyAuthError } from '@/lib/auth/errors'
import { recordAuthTelemetry } from '@/lib/auth/telemetry'

const requestSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required.')
    .email('Please enter a valid email address.')
    .trim()
    .toLowerCase(),
})

const updateSchema = z
  .object({
    newPassword: z
      .string()
      .min(1, 'New password is required.')
      .min(6, 'Password must be at least 6 characters.'),
    confirmPassword: z
      .string()
      .min(1, 'Please confirm your new password.'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  })

type RequestFormValues = z.infer<typeof requestSchema>
type UpdateFormValues = z.infer<typeof updateSchema>

function ResetPasswordFormContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const mode = searchParams.get('mode')
  const errorParam = searchParams.get('error')
  const isUpdateMode = mode === 'update'

  const [message, setMessage] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(
    errorParam === 'expired'
      ? 'Your password reset link is invalid or has expired. Please enter your email below to request a new link.'
      : null
  )
  const [isPending, startTransition] = useTransition()
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  // Listen for hash fragment token exchange if redirected directly by Supabase
  useEffect(() => {
    if (typeof window === 'undefined') return
    const hash = window.location.hash
    if (hash && hash.includes('type=recovery')) {
      const params = new URLSearchParams(hash.replace(/^#/, ''))
      const access_token = params.get('access_token')
      const refresh_token = params.get('refresh_token')
      if (access_token && refresh_token) {
        try {
          const supabase = createBrowserSupabaseClient()
          void supabase.auth.setSession({ access_token, refresh_token }).then(({ error }) => {
            if (!error) {
              router.replace('/reset-password?mode=update')
            }
          })
        } catch (err) {
          console.warn('[reset-password] Hash token session hydration error:', err)
        }
      }
    }
  }, [router])

  // Form for sending reset email
  const requestForm = useForm<RequestFormValues>({
    resolver: zodResolver(requestSchema),
    defaultValues: { email: '' },
  })

  // Form for setting new password
  const updateForm = useForm<UpdateFormValues>({
    resolver: zodResolver(updateSchema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  })

  const handleResetRequest = (values: RequestFormValues) => {
    setErrorMsg(null)
    setMessage(null)

    startTransition(async () => {
      try {
        const supabase = createBrowserSupabaseClient()
        const origin = window.location.origin
        const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
          redirectTo: `${origin}/api/auth/callback?next=/reset-password%3Fmode%3Dupdate`,
        })

        if (error) {
          const classified = classifyAuthError(error, 'reset_password')
          setErrorMsg(classified.message)
          recordAuthTelemetry(classified, 'reset_password')
          return
        }

        setMessage('Password reset link sent! Check your inbox for the recovery email.')
        requestForm.reset()
      } catch (err) {
        console.error('[reset-password] Request error:', err)
        const classified = classifyAuthError(err, 'reset_password')
        setErrorMsg(classified.message)
        recordAuthTelemetry(classified, 'reset_password')
      }
    })
  }

  const handlePasswordUpdate = (values: UpdateFormValues) => {
    setErrorMsg(null)
    setMessage(null)

    startTransition(async () => {
      try {
        const supabase = createBrowserSupabaseClient()
        const { data: { session } } = await supabase.auth.getSession()

        const res = await fetch('/api/auth/update-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {})
          },
          body: JSON.stringify({ newPassword: values.newPassword }),
        })

        const data = await res.json()

        if (!res.ok || !data.success) {
          const classified = classifyAuthError(
            data.error || 'Failed to update password. Please request a new reset link.',
            'reset_password'
          )
          setErrorMsg(classified.message)
          recordAuthTelemetry(classified, 'reset_password')
          return
        }

        setIsSuccess(true)
        setMessage('Your password has been updated successfully! Redirecting to login...')
        updateForm.reset()

        setTimeout(() => {
          router.push('/login?reset=success')
        }, 1500)
      } catch (err) {
        console.error('[reset-password] Update error:', err)
        const classified = classifyAuthError(err, 'reset_password')
        setErrorMsg(classified.message)
        recordAuthTelemetry(classified, 'reset_password')
      }
    })
  }

  const isLoading = isPending

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
      {errorMsg && (
        <div
          className="p-3 text-xs rounded-lg bg-destructive/10 border border-destructive/20 text-destructive font-medium flex items-start gap-2"
          role="alert"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {message && (
        <div
          className="p-3 text-xs rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-medium flex items-start gap-2"
          role="status"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
          <span>{message}</span>
        </div>
      )}

      {!isUpdateMode ? (
        <form onSubmit={requestForm.handleSubmit(handleResetRequest)} className="space-y-4" noValidate>
          <div>
            <label htmlFor="reset-email" className="block text-xs font-semibold uppercase text-foreground/80 mb-1">
              Email Address
            </label>
            <input
              id="reset-email"
              type="email"
              required
              disabled={isLoading}
              aria-invalid={!!requestForm.formState.errors.email}
              aria-describedby={requestForm.formState.errors.email ? 'email-error' : undefined}
              placeholder="jane@example.com"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:border-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed outline-none"
              {...requestForm.register('email')}
            />
            {requestForm.formState.errors.email && (
              <p id="email-error" className="mt-1 text-xs text-destructive font-medium" role="alert">
                {requestForm.formState.errors.email.message}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isPending ? 'Sending Link...' : 'Send Reset Link →'}
          </button>
        </form>
      ) : (
        <form onSubmit={updateForm.handleSubmit(handlePasswordUpdate)} className="space-y-4" noValidate>
          <div>
            <label htmlFor="new-password" className="block text-xs font-semibold uppercase text-foreground/80 mb-1">
              New Password
            </label>
            <div className="relative">
              <input
                id="new-password"
                type={showNewPassword ? 'text' : 'password'}
                required
                disabled={isLoading || isSuccess}
                aria-invalid={!!updateForm.formState.errors.newPassword}
                aria-describedby={updateForm.formState.errors.newPassword ? 'password-error' : 'password-hint'}
                placeholder="Min. 6 characters"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 pr-10 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:border-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed outline-none"
                {...updateForm.register('newPassword')}
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
              >
                {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p id="password-hint" className="mt-1 text-[11px] text-muted-foreground">
              Must be at least 6 characters long.
            </p>
            {updateForm.formState.errors.newPassword && (
              <p id="password-error" className="mt-1 text-xs text-destructive font-medium" role="alert">
                {updateForm.formState.errors.newPassword.message}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="confirm-password" className="block text-xs font-semibold uppercase text-foreground/80 mb-1">
              Confirm New Password
            </label>
            <div className="relative">
              <input
                id="confirm-password"
                type={showConfirmPassword ? 'text' : 'password'}
                required
                disabled={isLoading || isSuccess}
                aria-invalid={!!updateForm.formState.errors.confirmPassword}
                aria-describedby={updateForm.formState.errors.confirmPassword ? 'confirm-error' : undefined}
                placeholder="Re-enter your new password"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 pr-10 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:border-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed outline-none"
                {...updateForm.register('confirmPassword')}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
              >
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {updateForm.formState.errors.confirmPassword && (
              <p id="confirm-error" className="mt-1 text-xs text-destructive font-medium" role="alert">
                {updateForm.formState.errors.confirmPassword.message}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading || isSuccess}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isPending ? (
              'Updating Password...'
            ) : isSuccess ? (
              <>
                <CheckCircle2 className="w-4 h-4" /> Updated!
              </>
            ) : (
              <>
                <KeyRound className="w-4 h-4" /> Update Password
              </>
            )}
          </button>
        </form>
      )}

      <div className="mt-6 text-center text-xs text-muted-foreground border-t border-border pt-4 flex justify-between items-center">
        <Link
          href="/login"
          className="font-semibold text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 rounded"
        >
          ← Back to Log in
        </Link>
        <Link
          href={isUpdateMode ? '/reset-password' : '/reset-password?mode=update'}
          onClick={() => {
            setErrorMsg(null)
            setMessage(null)
          }}
          className="text-muted-foreground hover:underline text-[11px] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 rounded"
        >
          {isUpdateMode ? 'Need a new reset link?' : 'Have a recovery token?'}
        </Link>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="container mx-auto px-4 py-16 max-w-sm">
      <Suspense
        fallback={
          <div className="text-center">
            <h1 className="text-2xl font-bold font-serif text-foreground mb-2">
              Loading Reset Page...
            </h1>
          </div>
        }
      >
        <ResetPasswordHeader />
        <ResetPasswordFormContent />
      </Suspense>
    </div>
  )
}

function ResetPasswordHeader() {
  const searchParams = useSearchParams()
  const mode = searchParams.get('mode')
  const isUpdateMode = mode === 'update'

  return (
    <div className="text-center mb-8 flex flex-col items-center">
      <BrandMarkProdily size="md" className="mb-4" />
      <h1 className="text-2xl font-bold font-serif text-foreground mb-2">
        {isUpdateMode ? 'Set your new password' : 'Reset Your Password'}
      </h1>
      <p className="text-xs text-muted-foreground">
        {isUpdateMode
          ? 'Enter your new password below to secure your account.'
          : "Enter your email and we'll send you a password reset link."}
      </p>
    </div>
  )
}
