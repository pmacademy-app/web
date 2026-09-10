'use client'

import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import Script from 'next/script'

export interface TurnstileWidgetRef {
  reset: () => void
}

export interface TurnstileWidgetProps {
  siteKey?: string
  onSuccess: (token: string) => void
  onExpire?: () => void
  onError?: (errorCode?: string) => void
  className?: string
}

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement | string,
        options: {
          sitekey: string
          callback: (token: string) => void
          'expired-callback'?: () => void
          'error-callback'?: (errorCode?: string) => void
          theme?: 'light' | 'dark' | 'auto'
          size?: 'normal' | 'compact' | 'flexible'
        }
      ) => string
      reset: (widgetId: string) => void
      remove: (widgetId: string) => void
    }
  }
}

export const TurnstileWidget = forwardRef<TurnstileWidgetRef, TurnstileWidgetProps>(
  function TurnstileWidget(
    { siteKey, onSuccess, onExpire, onError, className = '' },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement>(null)
    const widgetIdRef = useRef<string | null>(null)

    // The render effect must not depend on the callback props. A consumer that passes
    // inline arrows would otherwise change their identity on every parent render, and
    // the effect's cleanup (`turnstile.remove`) plus re-render would issue a fresh
    // challenge — which calls back with a new token, re-renders the parent, and repeats
    // without ever settling. Holding them in a ref that is refreshed on every render
    // keeps the invoked callback current, so there is no stale closure either.
    const callbacksRef = useRef({ onSuccess, onExpire, onError })
    callbacksRef.current = { onSuccess, onExpire, onError }
    const [scriptLoaded, setScriptLoaded] = useState(false)
    const [loadError, setLoadError] = useState(false)

    const effectiveSiteKey =
      siteKey || process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ''

    // Expose imperative reset handle to parent form
    useImperativeHandle(ref, () => ({
      reset: () => {
        if (widgetIdRef.current && window.turnstile) {
          try {
            window.turnstile.reset(widgetIdRef.current)
          } catch {
            // Safe fallback if widget was destroyed or disconnected
          }
        }
      },
    }))

    // Render widget when script is loaded and container is mounted
    useEffect(() => {
      if (!scriptLoaded || !containerRef.current || !effectiveSiteKey) return
      if (!window.turnstile) return

      // Do not re-render if already rendered
      if (widgetIdRef.current !== null) return

      try {
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: effectiveSiteKey,
          theme: 'auto',
          callback: (token: string) => {
            callbacksRef.current.onSuccess(token)
          },
          'expired-callback': () => {
            callbacksRef.current.onExpire?.()
          },
          'error-callback': (errorCode?: string) => {
            callbacksRef.current.onError?.(errorCode)
          },
        })
      } catch (err) {
        console.error('[turnstile] Failed to render widget:', err)
        callbacksRef.current.onError?.('render_failed')
      }

      return () => {
        if (widgetIdRef.current !== null && window.turnstile) {
          try {
            window.turnstile.remove(widgetIdRef.current)
          } catch {
            // Ignore cleanup error on unmount
          }
          widgetIdRef.current = null
        }
      }
      // Deliberately excludes the callback props — see `callbacksRef` above.
    }, [scriptLoaded, effectiveSiteKey])

    // If Turnstile is already on window before next/script onLoad fires (e.g. navigation)
    useEffect(() => {
      if (typeof window !== 'undefined' && window.turnstile && !scriptLoaded) {
        setScriptLoaded(true)
      }
    }, [scriptLoaded])

    return (
      <div className={`turnstile-container flex flex-col items-center justify-center my-2 ${className}`}>
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          strategy="afterInteractive"
          onLoad={() => setScriptLoaded(true)}
          onError={() => {
            setLoadError(true)
            callbacksRef.current.onError?.('script_load_error')
          }}
        />

        {loadError && (
          <div
            role="alert"
            className="text-xs text-destructive text-center p-2 rounded bg-destructive/10 border border-destructive/20 w-full"
          >
            Security verification failed to load. Please disable ad-blockers or refresh the page.
          </div>
        )}

        {!loadError && !effectiveSiteKey && process.env.NODE_ENV !== 'production' && (
          <div className="text-xs text-muted-foreground text-center p-2 border border-dashed rounded w-full">
            Turnstile site key not configured (<code className="text-xs">NEXT_PUBLIC_TURNSTILE_SITE_KEY</code>).
          </div>
        )}

        <div
          ref={containerRef}
          className="min-h-[65px] flex items-center justify-center"
          aria-label="Cloudflare Turnstile security challenge"
        />
      </div>
    )
  }
)
