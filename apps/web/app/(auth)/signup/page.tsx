'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { createBrowserSupabaseClient } from '@/lib/supabase'

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
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  // const [isGoogleLoading, setIsGoogleLoading] = useState(false) // Uncomment when Google OAuth is enabled

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
    setErrorMsg(null)
    setSuccessMsg(null)

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

        if (error) {
          // Supabase occasionally returns '{}' as message for ambiguous errors
          // (e.g. re-registering an unconfirmed email, rate limits, etc.)
          const raw = error.message?.trim()
          const msg =
            !raw || raw === '{}' || raw === 'null'
              ? 'Could not create account. The email may already be registered — try logging in or resetting your password.'
              : raw
          setErrorMsg(msg)
          return
        }

        // If email confirmation is disabled, user is immediately logged in
        if (data.session) {
          router.push('/dashboard')
          router.refresh()
        } else {
          setSuccessMsg('Account created! Please check your email to verify your address.')
        }
      } catch (err) {
        console.error('[signup] Error registering:', err)
        setErrorMsg('An unexpected error occurred. Please try again.')
      }
    })
  }

  /*
  const handleGoogleSignup = async () => {
    setErrorMsg(null)
    setIsGoogleLoading(true)

    try {
      const supabase = createBrowserSupabaseClient()
      const origin = window.location.origin
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${origin}/api/auth/callback`,
        },
      })

      if (error) {
        setErrorMsg(error.message)
        setIsGoogleLoading(false)
      }
    } catch (err) {
      console.error('[signup] Google signup error:', err)
      setErrorMsg('Could not initialize Google signup.')
      setIsGoogleLoading(false)
    }
  }
  */

  const isLoading = isPending

  return (
    <div className="container mx-auto px-4 py-16 max-w-sm">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold font-serif text-foreground mb-2">
          Create Your Free Account
        </h1>
        <p className="text-xs text-muted-foreground">
          90 lessons. 9 modules. Always free.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
        {/* Google OAuth Button */}
        <button
          type="button"
          disabled={true}
          aria-label="Sign up with Google (Coming Soon)"
          className="w-full flex items-center justify-center gap-3 rounded-lg border border-input bg-background/50 py-2.5 px-4 text-sm font-medium text-muted-foreground shadow-sm focus:outline-none transition-all cursor-not-allowed opacity-60 relative overflow-hidden"
        >
          <svg className="w-4 h-4 opacity-50" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="currentColor"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="currentColor"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="currentColor"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>Sign up with Google</span>
          <span className="ml-auto text-[10px] bg-secondary text-secondary-foreground font-semibold px-2 py-0.5 rounded-full border border-border">
            Coming Soon
          </span>
        </button>

        <div className="relative flex items-center justify-center my-4">
          <div className="border-t border-border w-full" />
          <span className="bg-card px-2 text-[10px] uppercase font-semibold text-muted-foreground absolute">
            or email
          </span>
        </div>

        {errorMsg && (
          <div
            className="p-3 text-xs rounded-lg bg-destructive/10 border border-destructive/20 text-destructive font-medium"
            role="alert"
          >
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div
            className="p-3 text-xs rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-medium"
            role="alert"
          >
            {successMsg}
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
            {isPending ? 'Creating Account...' : 'Create Account →'}
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
    </div>
  )
}
