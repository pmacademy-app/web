'use client'

import dynamic from 'next/dynamic'

/**
 * ShareButton picks its icon from `navigator` during render, so on a server-rendered page it is
 * loaded client-only (as on the dashboard) to avoid a hydration mismatch.
 */
const ShareButton = dynamic(
  () => import('@/components/portfolio/ShareButton').then((mod) => mod.ShareButton),
  { ssr: false, loading: () => <span aria-hidden="true" className="inline-block h-10 w-40 rounded-lg bg-muted/40" /> },
)

/** Share one capstone page (Growth R5 B13b): its own URL, third-person text. */
export function CapstoneShare(props: { username: string; name: string; moduleSlug: string; title: string }) {
  return (
    <ShareButton
      username={props.username}
      name={props.name}
      context="capstone"
      capstone={{ moduleSlug: props.moduleSlug, title: props.title }}
    />
  )
}
