'use client'

import { useState, useTransition, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { BrandMarkProdigy } from '@/components/brand/BrandLogo'

const requestSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required.')
    .email('Please enter a valid email address.')
    .trim()
    .toLowerCase(),
})

const updateSchema = z.object({
  newPassword: z
    .string()
    .min(1, 'Password is required.')
    .min(6, 'Password must be at least 6 characters.'),
})

type RequestFormValues = z.infer<typeof requestSchema>
type UpdateFormValues = z.infer<typeof updateSchema>

function ResetPasswordFormContent() {
  const searchParams = useSearchParams()
  const mode = searchParams.get('mode')
  const isUpdateMode = mode === 'update'

  const [message, setMessage] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Form for sending reset email
  const requestForm = useForm<RequestFormValues>({
    resolver: zodResolver(requestSchema),
    defaultValues: { email: '' },
  })

  // Form for setting new password
  const updateForm = useForm<UpdateFormValues>({
    resolver: zodResolver(updateSchema),
    defaultValues: { newPassword: '' },
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
          setErrorMsg(error.message)
          return
        }

        setMessage('Password reset link sent! Check your inbox.')
        requestForm.reset()
      } catch (err) {
        console.error('[reset-password] Request error:', err)
        setErrorMsg('An unexpected error occurred. Please try again.')
      }
    })
  }

  const handlePasswordUpdate = (values: UpdateFormValues) => {
    setErrorMsg(null)
    setMessage(null)

    startTransition(async () => {
      try {
        const supabase = createBrowserSupabaseClient()
        const { error } = await supabase.auth.updateUser({
          password: values.newPassword,
        })

        if (error) {
          setErrorMsg(error.message)
          return
        }

        setMessage('Password updated successfully! You can now log in.')
        updateForm.reset()
      } catch (err) {
        console.error('[reset-password] Update error:', err)
        setErrorMsg('An unexpected error occurred. Please try again.')
      }
    })
  }

  const isLoading = isPending

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
      {errorMsg && (
        <div
          className="p-3 text-xs rounded-lg bg-destructive/10 border border-destructive/20 text-destructive font-medium"
          role="alert"
        >
          {errorMsg}
        </div>
      )}

      {message && (
        <div
          className="p-3 text-xs rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-medium"
          role="alert"
        >
          {message}
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
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
            <input
              id="new-password"
              type="password"
              required
              disabled={isLoading}
              aria-invalid={!!updateForm.formState.errors.newPassword}
              aria-describedby={updateForm.formState.errors.newPassword ? 'password-error' : undefined}
              placeholder="Min. 6 characters"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:border-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed outline-none"
              {...updateForm.register('newPassword')}
            />
            {updateForm.formState.errors.newPassword && (
              <p id="password-error" className="mt-1 text-xs text-destructive font-medium" role="alert">
                {updateForm.formState.errors.newPassword.message}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? 'Updating Password...' : 'Update Password'}
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
          {isUpdateMode ? 'Need reset email?' : 'Have reset token?'}
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
      <BrandMarkProdigy size="md" className="mb-4" />
      <h1 className="text-2xl font-bold font-serif text-foreground mb-2">
        {isUpdateMode ? 'Set New Password' : 'Reset Your Password'}
      </h1>
      <p className="text-xs text-muted-foreground">
        {isUpdateMode
          ? 'Enter your new password below.'
          : "Enter your email and we'll send you a password reset link."}
      </p>
    </div>
  )
}
