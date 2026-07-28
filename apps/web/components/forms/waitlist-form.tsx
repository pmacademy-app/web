'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { SuccessState } from '@/components/feedback/success-state'
import { ErrorState } from '@/components/feedback/error-state'
import { trackWaitlistSignup } from '@/lib/analytics'
import { ROLE_OPTIONS } from '@/types'
import type { WaitlistFormValues } from '@/types'
import { cn } from '@/lib/utils'

// ─── Validation schema ─────────────────────────────────────────────────────────

const schema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters.')
    .max(80, 'Name must be less than 80 characters.')
    .trim(),
  email: z
    .string()
    .email('Enter a valid email address.')
    .trim(),
  career_position: z.enum([
    'Student',
    'Aspiring Product Manager',
    'Product Manager',
    'Software Engineer',
    'Designer',
    'Founder',
    'Marketing',
    'Sales',
    'Business Analyst',
    'Data Analyst',
    'Consultant',
    'Other',
  ] as const, {
    message: 'Select a role from the list.',
  }),
}) satisfies z.ZodType<WaitlistFormValues>

type FormValues = z.infer<typeof schema>

// ─── Attribution helper ────────────────────────────────────────────────────────

function getUTMParams() {
  if (typeof window === 'undefined') return {}
  const params = new URLSearchParams(window.location.search)
  return {
    utm_source:   params.get('utm_source')   ?? undefined,
    utm_medium:   params.get('utm_medium')   ?? undefined,
    utm_campaign: params.get('utm_campaign') ?? undefined,
  }
}

// ─── Field components ─────────────────────────────────────────────────────────

interface FieldProps {
  id: string
  label: string
  error?: string
  children: React.ReactNode
}

function Field({ id, label, error, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-body-sm font-medium text-foreground">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-caption text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

// ─── WaitlistForm ─────────────────────────────────────────────────────────────

/**
 * Waitlist signup form — Sprint 2 §25 + Sprint 3 §9 form copy.
 * Fields: Full Name, Email, Current Role (dropdown)
 * States: default → loading → success | error
 */
export function WaitlistForm({ className }: { className?: string }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormValues) => {
    setStatus('loading')
    setServerError(null)

    try {
      const utmParams = getUTMParams()

      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, ...utmParams }),
      })

      const json = await response.json()

      if (response.ok) {
        setStatus('success')
        trackWaitlistSignup()
      } else if (response.status === 409) {
        // Duplicate — treat as soft success
        setStatus('success')
      } else {
        setStatus('error')
        setServerError(json.error ?? 'Something went wrong. Try again in a moment.')
      }
    } catch {
      setStatus('error')
      setServerError('Could not reach the server. Check your connection and try again.')
    }
  }

  const handleRetry = () => {
    setStatus('idle')
    setServerError(null)
  }

  // ── Success state ──────────────────────────────────────────────────────────
  if (status === 'success') {
    return <SuccessState />
  }

  // ── Form ───────────────────────────────────────────────────────────────────
  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      aria-label="Join the PM Academy waitlist"
      className={cn('flex flex-col gap-4 w-full', className)}
    >
      {/* Server error */}
      {status === 'error' && serverError && (
        <ErrorState message={serverError} onRetry={handleRetry} />
      )}

      {/* Full Name */}
      <Field id="waitlist-name" label="Full Name" error={errors.name?.message}>
        <input
          id="waitlist-name"
          type="text"
          autoComplete="name"
          placeholder="Your full name"
          aria-required="true"
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? 'waitlist-name-error' : undefined}
          disabled={status === 'loading'}
          className={cn(
            'w-full h-11 px-3.5 rounded-sm bg-surface text-body text-foreground',
            'border transition-colors duration-[120ms]',
            'placeholder:text-locked',
            'focus:outline-none focus:ring-2 focus:ring-focus focus:border-transparent',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            errors.name
              ? 'border-danger focus:ring-danger/50'
              : 'border-border hover:border-border-strong',
          )}
          {...register('name')}
        />
      </Field>

      {/* Email */}
      <Field id="waitlist-email" label="Email address" error={errors.email?.message}>
        <input
          id="waitlist-email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          aria-required="true"
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? 'waitlist-email-error' : undefined}
          disabled={status === 'loading'}
          className={cn(
            'w-full h-11 px-3.5 rounded-sm bg-surface text-body text-foreground',
            'border transition-colors duration-[120ms]',
            'placeholder:text-locked',
            'focus:outline-none focus:ring-2 focus:ring-focus focus:border-transparent',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            errors.email
              ? 'border-danger focus:ring-danger/50'
              : 'border-border hover:border-border-strong',
          )}
          {...register('email')}
        />
      </Field>

      {/* Role dropdown */}
      <Field
        id="waitlist-role"
        label="What best describes you?"
        error={errors.career_position?.message}
      >
        <select
          id="waitlist-role"
          aria-required="true"
          aria-invalid={!!errors.career_position}
          aria-describedby={errors.career_position ? 'waitlist-role-error' : undefined}
          disabled={status === 'loading'}
          defaultValue=""
          className={cn(
            'w-full h-11 px-3.5 rounded-sm bg-surface text-body text-foreground',
            'border transition-colors duration-[120ms]',
            'focus:outline-none focus:ring-2 focus:ring-focus focus:border-transparent',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'appearance-none cursor-pointer',
            errors.career_position
              ? 'border-danger focus:ring-danger/50'
              : 'border-border hover:border-border-strong',
          )}
          {...register('career_position')}
        >
          <option value="" disabled>Select your role</option>
          {ROLE_OPTIONS.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
      </Field>

      {/* Submit */}
      <button
        type="submit"
        disabled={status === 'loading'}
        aria-busy={status === 'loading'}
        className="
          w-full h-11 flex items-center justify-center gap-2
          bg-primary text-primary-foreground
          text-body-sm font-semibold rounded-sm
          hover:opacity-90 active:scale-[0.98]
          disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100
          transition-all duration-[120ms]
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus
        "
      >
        {status === 'loading' ? (
          <>
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            <span>Joining waitlist…</span>
          </>
        ) : (
          'Join Waitlist'
        )}
      </button>

      {/* Trust line */}
      <p className="text-center text-caption text-locked">
        Free core curriculum. No paywalled lessons.
      </p>
    </form>
  )
}
