/**
 * The one-line honesty caption under every illustrative mock on the homepage.
 *
 * Server component. The default text comes from `config/marketing.ts`; pass
 * `children` only when a mock needs a more specific line.
 */

import type { ReactNode } from 'react'

import { ILLUSTRATION_CAPTION } from '@/config/marketing'

interface IllustrationCaptionProps {
  children?: ReactNode
  className?: string
  /** Render as `<figcaption>` when the mock is wrapped in a `<figure>`. */
  as?: 'p' | 'figcaption'
}

export function IllustrationCaption({
  children,
  className = '',
  as: Tag = 'p',
}: IllustrationCaptionProps) {
  return (
    <Tag className={`text-caption leading-snug text-ink-muted ${className}`.trim()}>
      {children ?? ILLUSTRATION_CAPTION}
    </Tag>
  )
}
