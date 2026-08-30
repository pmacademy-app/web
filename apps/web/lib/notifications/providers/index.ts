import type { NotificationChannel } from '../types'
import type { NotificationProvider } from './types'
import { ResendProvider } from './resend-provider'
import { BrevoProvider } from './brevo-provider'

export * from './types'
export * from './resend-provider'
export * from './brevo-provider'

export class ProviderRegistry {
  private providers: Map<string, NotificationProvider> = new Map()

  constructor() {
    // Scaffold default email providers
    this.registerProvider(new BrevoProvider())
    this.registerProvider(new ResendProvider())
  }

  public registerProvider(provider: NotificationProvider): void {
    this.providers.set(provider.name, provider)
  }

  public getProvider(name: string): NotificationProvider | undefined {
    return this.providers.get(name)
  }

  public getProvidersForChannel(channel: NotificationChannel): NotificationProvider[] {
    return Array.from(this.providers.values()).filter((p) =>
      p.supportedChannels.includes(channel)
    )
  }

  public getAllProviders(): NotificationProvider[] {
    return Array.from(this.providers.values())
  }
}

export const globalProviderRegistry = new ProviderRegistry()

/**
 * Returns the active configured email provider.
 * Priority:
 * 1. PRIMARY_EMAIL_PROVIDER environment variable (e.g. 'brevo' or 'resend')
 * 2. Brevo if BREVO_API_KEY exists
 * 3. Resend fallback if RESEND_API_KEY exists
 * 4. Brevo default
 */
export function getActiveEmailProvider(registry: ProviderRegistry = globalProviderRegistry): NotificationProvider {
  const preferred = (process.env.PRIMARY_EMAIL_PROVIDER || (process.env.BREVO_API_KEY ? 'brevo' : 'resend')).toLowerCase().trim()
  const provider = registry.getProvider(preferred)
  if (provider) return provider
  return registry.getProvider('brevo') || registry.getProvider('resend') || new BrevoProvider()
}

