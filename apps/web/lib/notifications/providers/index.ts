import type { NotificationChannel } from '../types'
import type { NotificationProvider } from './types'
import { ResendProvider } from './resend-provider'

export * from './types'
export * from './resend-provider'

export class ProviderRegistry {
  private providers: Map<string, NotificationProvider> = new Map()

  constructor() {
    // Scaffold default provider
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
