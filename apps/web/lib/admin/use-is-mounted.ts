import { useSyncExternalStore } from 'react'

const emptySubscribe = () => () => {}

/**
 * SSR-safe hook to determine if the component has mounted on the client.
 * Uses useSyncExternalStore to return false on the server and true on the client,
 * avoiding React cascading renders and setState-in-effect lint violations.
 */
export function useIsMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  )
}
