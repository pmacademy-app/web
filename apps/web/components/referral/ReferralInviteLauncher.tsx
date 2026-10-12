'use client'

import { useApiQuery } from '@/lib/api/hooks'
import type { ReferralStatsResponse } from '@/lib/api/contracts/settings'
import { ReferralShareModal } from './ReferralShareModal'

/**
 * Opens the referral modal for a surface that has no referral data of its own (Growth R5 B11).
 * The link is fetched only once `open` is true (a null SWR key until then), and the modal renders
 * only when the link has loaded. A failed fetch ends the attempt through `onClose`.
 */
export function ReferralInviteLauncher({
  open,
  onClose,
  source,
}: {
  open: boolean
  onClose: () => void
  source: string
}) {
  const { data } = useApiQuery<ReferralStatsResponse>(open ? '/api/referrals' : null, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
    onError: onClose,
  })
  const link = data?.stats?.referralLink || null

  return (
    <ReferralShareModal
      isOpen={open && Boolean(link)}
      onClose={onClose}
      referralLink={link ?? ''}
      source={source}
      rewardXp={data?.stats?.rewardXp}
    />
  )
}
