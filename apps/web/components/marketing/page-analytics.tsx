'use client'

import { useScrollDepth } from '@/hooks/use-analytics'

export function PageAnalytics() {
  useScrollDepth()
  return null
}
