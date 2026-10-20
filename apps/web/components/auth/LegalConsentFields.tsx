import type React from 'react'
import Link from 'next/link'
import { MINIMUM_SIGNUP_AGE } from '@/lib/legal/consent'

export interface LegalConsentFieldsProps {
  /** Spread onto the Terms/Privacy checkbox. Works with react-hook-form `register()` or controlled props. */
  termsInputProps: React.ComponentPropsWithRef<'input'>
  /** Spread onto the minimum-age checkbox. */
  ageInputProps: React.ComponentPropsWithRef<'input'>
  termsError?: string
  ageError?: string
  disabled?: boolean
}

const CHECKBOX_CLASS =
  'mt-0.5 h-4 w-4 shrink-0 rounded border-border text-primary accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1'

/**
 * The two legal acknowledgements required before an account can be created.
 *
 * Shared by the signup form and the Google consent gate so the copy, ids and links
 * cannot drift apart. Presentational only: the caller owns the state, and the server
 * owns the recorded timestamp and document versions. The boxes are never pre-ticked;
 * callers must start them unchecked.
 */
export function LegalConsentFields({
  termsInputProps,
  ageInputProps,
  termsError,
  ageError,
  disabled,
}: LegalConsentFieldsProps) {
  return (
    <div className="space-y-3 pt-1">
      <div>
        <label htmlFor="signup-accept-terms" className="flex items-start gap-2.5 cursor-pointer">
          <input
            id="signup-accept-terms"
            type="checkbox"
            disabled={disabled}
            aria-invalid={termsError ? true : undefined}
            aria-describedby={termsError ? 'accept-terms-error' : undefined}
            className={CHECKBOX_CLASS}
            {...termsInputProps}
          />
          <span className="text-xs leading-relaxed text-muted-foreground">
            I have read and agree to the{' '}
            <Link
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-primary hover:underline"
            >
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-primary hover:underline"
            >
              Privacy Policy
            </Link>
            .
          </span>
        </label>
        {termsError && (
          <p id="accept-terms-error" className="mt-1 text-xs text-destructive font-medium" role="alert">
            {termsError}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="signup-confirm-age" className="flex items-start gap-2.5 cursor-pointer">
          <input
            id="signup-confirm-age"
            type="checkbox"
            disabled={disabled}
            aria-invalid={ageError ? true : undefined}
            aria-describedby={ageError ? 'confirm-age-error' : undefined}
            className={CHECKBOX_CLASS}
            {...ageInputProps}
          />
          <span className="text-xs leading-relaxed text-muted-foreground">
            I confirm I am at least {MINIMUM_SIGNUP_AGE} years old.
          </span>
        </label>
        {ageError && (
          <p id="confirm-age-error" className="mt-1 text-xs text-destructive font-medium" role="alert">
            {ageError}
          </p>
        )}
      </div>
    </div>
  )
}
