'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { BrandMarkProdily } from '@/components/brand/BrandLogo'

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

        const isExistingAccountError =
          Boolean(error && (
            error.message?.toLowerCase().includes('already registered') ||
            error.message?.toLowerCase().includes('already in use') ||
            error.message?.toLowerCase().includes('already exists')
          )) ||
          Boolean(data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0)

        if (isExistingAccountError) {
          setErrorMsg('An account already exists with this email address. Please log in instead.')
          return
        }

        if (error) {
          const raw = error.message?.trim()
          const msg =
            !raw || raw === '{}' || raw === 'null'
              ? 'Could not create account. Please check your credentials or try logging in.'
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
      <div className="text-center mb-8 flex flex-col items-center">
        <BrandMarkProdily size="md" className="mb-4" />
        <h1 className="text-2xl font-bold font-serif text-foreground mb-2">
          Create Your Free Account
        </h1>
        <p className="text-xs text-muted-foreground">
          90 lessons. 9 modules. Always free.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">

        {errorMsg && (
          <div
            className="p-3 text-xs rounded-lg bg-destructive/10 border border-destructive/20 text-destructive font-medium flex flex-col gap-1.5"
            role="alert"
          >
            <span>{errorMsg}</span>
            {errorMsg.includes('already exists') && (
              <Link
                href="/login"
                className="inline-flex items-center gap-1 font-bold underline hover:opacity-80 text-primary w-fit"
              >
                Go to Login →
              </Link>
            )}
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
