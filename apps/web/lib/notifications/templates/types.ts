import type { NotificationCategory } from '../types'

export type TemplateStatus = 'draft' | 'active' | 'deprecated'

export interface TemplateVersionMetadata {
  id: string
  templateId: string
  version: number
  subjectLine: string
  bodyText: string
  bodyHtml: string
  status: TemplateStatus
  createdAt: string
  updatedAt: string
}

export interface TemplateMetadata {
  id: string
  templateKey: string
  category: NotificationCategory
  currentVersion: number
  versions: TemplateVersionMetadata[]
  createdAt: string
  updatedAt: string
}
