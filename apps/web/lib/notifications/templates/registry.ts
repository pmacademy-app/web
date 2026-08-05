import type { TemplateMetadata, TemplateVersionMetadata } from './types'

/**
 * Metadata Registry Service for Email & Notification Templates
 */
export class TemplateRegistryService {
  private templates: Map<string, TemplateMetadata> = new Map()

  /**
   * Registers metadata for a template along with its version history.
   */
  public registerTemplate(template: TemplateMetadata): void {
    this.templates.set(template.templateKey, template)
  }

  /**
   * Retrieves template metadata by unique key.
   */
  public getTemplateMetadata(templateKey: string): TemplateMetadata | undefined {
    return this.templates.get(templateKey)
  }

  /**
   * Resolves the current active version metadata for a template.
   */
  public getActiveVersion(templateKey: string): TemplateVersionMetadata | undefined {
    const template = this.templates.get(templateKey)
    if (!template) return undefined

    return template.versions.find(
      (v) => v.version === template.currentVersion && v.status === 'active'
    )
  }

  /**
   * Checks whether a specific version of a template is deprecated.
   */
  public isVersionDeprecated(templateKey: string, version: number): boolean {
    const template = this.templates.get(templateKey)
    if (!template) return false
    const ver = template.versions.find((v) => v.version === version)
    return ver ? ver.status === 'deprecated' : false
  }

  /**
   * Returns all registered template metadata objects.
   */
  public getAllTemplates(): TemplateMetadata[] {
    return Array.from(this.templates.values())
  }
}

export const globalTemplateRegistry = new TemplateRegistryService()
