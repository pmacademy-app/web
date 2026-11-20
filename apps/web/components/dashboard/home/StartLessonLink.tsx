'use client'

import Link from 'next/link'
import type { ComponentProps } from 'react'
import { trackFirstSessionStarted } from '@/lib/analytics'

/** The lesson button. On a learner's very first lesson it also records first_session_started. */
export function StartLessonLink({
  firstSession,
  lessonId,
  moduleSlug,
  ...props
}: ComponentProps<typeof Link> & { firstSession: boolean; lessonId: string; moduleSlug: string }) {
  return (
    <Link
      {...props}
      onClick={(e) => {
        if (firstSession) trackFirstSessionStarted({ lesson_id: lessonId, module_slug: moduleSlug })
        props.onClick?.(e)
      }}
    />
  )
}
