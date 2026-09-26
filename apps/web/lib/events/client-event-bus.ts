'use client'

export interface ClientNotificationEventDetail {
  title: string
  body: string
  actionUrl?: string
  category?: string
  xpEarned?: number
  badgeName?: string
  variant?: 'success' | 'error' | 'info'
}

const EVENT_NAME = 'pma:notification-emitted'

export function dispatchClientNotificationEvent(detail: ClientNotificationEventDetail): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail }))
  }
}

export function showClientToast(
  title: string,
  body: string,
  variant: 'success' | 'error' | 'info' = 'info'
): void {
  dispatchClientNotificationEvent({ title, body, variant })
}

export function subscribeClientNotificationEvent(
  callback: (detail: ClientNotificationEventDetail) => void
): () => void {
  if (typeof window === 'undefined') return () => {}

  const handler = (e: Event) => {
    const customEvt = e as CustomEvent<ClientNotificationEventDetail>
    if (customEvt.detail) {
      callback(customEvt.detail)
    }
  }

  window.addEventListener(EVENT_NAME, handler)
  return () => {
    window.removeEventListener(EVENT_NAME, handler)
  }
}
