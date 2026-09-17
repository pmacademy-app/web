'use client'

import { useState, useTransition, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Eye, EyeOff, CheckCircle2, KeyRound } from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { BrandMarkProdily } from '@/components/brand/BrandLogo'
import { classifyAuthError, resolveApiAuthError } from '@/lib/auth/errors'
import { AuthErrorNotice } from '@/components/auth/AuthErrorNotice'
import { AuthSuccessNotice } from '@/components/auth/AuthSuccessNotice'
import { recordAuthTelemetry } from '@/lib/auth/telemetry'
import { updatePasswordAction } from './actions'

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
        const result = await updatePasswordAction(values.newPassword)

        if (result.error) {
          // The action now returns the shared error contract, so read its stable code
          // instead of re-deriving one from the message.
          const classified = resolveApiAuthError(result, 'reset_password')
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
        <AuthErrorNotice error={{ message: errorMsg }} />
      )}

      {message && (
        <AuthSuccessNotice>{message}</AuthSuccessNotice>
      )}

      {!isUpdateMode ? (
        <form onSubmit={requestForm.handleSubmit(handleResetRequest)} className="space-y-4" noValidate>
          <div>
            <label htmlFor="reset-email" className="block text-xs font-semibold uppercase text-foreground/80 mb-1">
              Email Address
            </label>
            <Input
              id="reset-email"
              type="email"
              required
              disabled={isLoading}
              error={!!requestForm.formState.errors.email}
              aria-describedby={requestForm.formState.errors.email ? 'email-error' : undefined}
              placeholder="jane@example.com"
              {...requestForm.register('email')}
            />
            {requestForm.formState.errors.email && (
              <p id="email-error" className="mt-1 text-xs text-destructive font-medium" role="alert">
                {requestForm.formState.errors.email.message}
              </p>
            )}
          </div>

          <Button
            type="submit"
            loading={isPending}
            disabled={isLoading}
            className="w-full"
          >
            {isPending ? 'Sending Link...' : 'Send Reset Link →'}
          </Button>
        </form>
      ) : (
        <form onSubmit={updateForm.handleSubmit(handlePasswordUpdate)} className="space-y-4" noValidate>
          <div>
            <label htmlFor="new-password" className="block text-xs font-semibold uppercase text-foreground/80 mb-1">
              New Password
            </label>
            <div className="relative">
              <Input
                id="new-password"
                type={showNewPassword ? 'text' : 'password'}
                required
                disabled={isLoading || isSuccess}
                error={!!updateForm.formState.errors.newPassword}
                aria-describedby={updateForm.formState.errors.newPassword ? 'password-error' : 'password-hint'}
                placeholder="Min. 6 characters"
                className="pr-10"
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
              <Input
                id="confirm-password"
                type={showConfirmPassword ? 'text' : 'password'}
                required
                disabled={isLoading || isSuccess}
                error={!!updateForm.formState.errors.confirmPassword}
                aria-describedby={updateForm.formState.errors.confirmPassword ? 'confirm-error' : undefined}
                placeholder="Re-enter your new password"
                className="pr-10"
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

          <Button
            type="submit"
            loading={isPending}
            disabled={isLoading || isSuccess}
            className="w-full"
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
          </Button>
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
