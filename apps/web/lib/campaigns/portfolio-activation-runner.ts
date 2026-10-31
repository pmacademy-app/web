/**
 * CQ-02: Portfolio activation runner is permanently disabled and deprecated.
 * BroadcastService natively handles broadcasts and refuses legacy portfolio activation campaigns.
 */

export const CAMPAIGN_ID = 'portfolio_activation_sep_2026'
export const CAMPAIGN_TITLE = 'Prodily Public Portfolio & First Capstone Campaign'

export const PORTFOLIO_ACTIVATION_DISABLED_REASON =
  'Portfolio activation runner disabled pending activation review'

export async function executePortfolioActivationCampaign(): Promise<{
  success: boolean
  sentCount: number
  failedCount: number
  skippedCount: number
  totalRecipients: number
  error?: string
}> {
  throw new Error(PORTFOLIO_ACTIVATION_DISABLED_REASON)
}
