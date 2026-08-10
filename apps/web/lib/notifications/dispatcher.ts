import type { EventEnvelope } from './types'
import { validateEventPayload } from './events'

export type EventHandler<T = Record<string, unknown>> = (
  event: EventEnvelope<T>
) => Promise<void> | void

export interface HandlerRegistration {
  id: string
  eventType: string
  handler: EventHandler<unknown>
}

export class NotificationEventDispatcher {
  private handlers: Map<string, Map<string, EventHandler<unknown>>> = new Map()

  /**
   * Registers a handler for a specific notification event type.
   * Prevents duplicate handler registration if same ID is provided.
   */
  public registerHandler<T = Record<string, unknown>>(
    eventType: string,
    handlerId: string,
    handler: EventHandler<T>
  ): boolean {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Map())
    }

    const eventHandlers = this.handlers.get(eventType)!
    if (eventHandlers.has(handlerId)) {
      console.warn(`[NotificationDispatcher] Handler '${handlerId}' already registered for '${eventType}'`)
      return false
    }

    eventHandlers.set(handlerId, handler as EventHandler<unknown>)
    return true
  }

  /**
   * Unregisters a handler by ID for an event type.
   */
  public unregisterHandler(eventType: string, handlerId: string): boolean {
    const eventHandlers = this.handlers.get(eventType)
    if (!eventHandlers) return false
    return eventHandlers.delete(handlerId)
  }

  /**
   * Returns list of registered handler IDs for a given event.
   */
  public getRegisteredHandlerIds(eventType: string): string[] {
    const eventHandlers = this.handlers.get(eventType)
    if (!eventHandlers) return []
    return Array.from(eventHandlers.keys())
  }

  /**
   * Dispatches an event envelope to all registered handlers for the event type.
   * Validates payload structure before invoking handlers.
   * Catches handler errors to guarantee fire-and-forget safety for the caller.
   */
  public async dispatch<T = Record<string, unknown>>(
    event: EventEnvelope<T>
  ): Promise<{ dispatched: boolean; handlerCount: number; errors: Array<{ handlerId: string; error: Error }> }> {
    const isValid = validateEventPayload(event.event, event.payload)
    if (!isValid) {
      console.error(`[NotificationDispatcher] Payload validation failed for event '${event.event}'`, event)
      return { dispatched: false, handlerCount: 0, errors: [
        { handlerId: 'validation', error: new Error(`Invalid payload structure for event ${event.event}`) }
      ] }
    }

    let eventHandlers = this.handlers.get(event.event)
    if (!eventHandlers || eventHandlers.size === 0) {
      try {
        const { initializeNotificationConnectors } = await import('./events/connectors')
        initializeNotificationConnectors()
        eventHandlers = this.handlers.get(event.event)
      } catch {
        // Fall through
      }
    }

    if (!eventHandlers || eventHandlers.size === 0) {
      return { dispatched: true, handlerCount: 0, errors: [] }
    }

    const errors: Array<{ handlerId: string; error: Error }> = []
    const promises: Promise<void>[] = []

    for (const [handlerId, handler] of eventHandlers.entries()) {
      const task = (async () => {
        try {
          await handler(event)
        } catch (err) {
          const errorObj = err instanceof Error ? err : new Error(String(err))
          console.error(`[NotificationDispatcher] Error in handler '${handlerId}' for event '${event.event}':`, errorObj)
          errors.push({ handlerId, error: errorObj })
        }
      })()
      promises.push(task)
    }

    await Promise.all(promises)

    return {
      dispatched: true,
      handlerCount: eventHandlers.size,
      errors,
    }
  }

  /**
   * Clears all registered handlers (used mainly in testing).
   */
  public clearAllHandlers(): void {
    this.handlers.clear()
  }
}

// Global Singleton Dispatcher Instance
export const globalNotificationDispatcher = new NotificationEventDispatcher()
