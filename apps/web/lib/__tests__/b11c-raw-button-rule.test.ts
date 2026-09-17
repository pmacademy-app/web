import { describe, it, expect } from 'vitest'
import { Linter } from 'eslint'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

import prodilyPlugin from '../../eslint-rules/no-raw-button.mjs'

/**
 * B11-C — the raw-button ban in components/ is enforced, not merely adopted.
 *
 * B11-A created the shared Button primitive and migrated representative high-traffic
 * surfaces. B11-C locks in that transition:
 *
 *   1. The ESLint rule rejects raw <button> in un-allowlisted components.
 *   2. The primitive itself (components/ui/button.tsx) is inherently exempt.
 *   3. Files outside components/ (e.g. app/ pages) are not governed by this rule.
 *   4. The repository's inventory of legacy unmigrated components exactly matches
 *      the documented allowlist in eslint.config.mjs, so no unreviewed escape hatches exist.
 */

const COMPONENTS_DIR = path.resolve(import.meta.dirname, '../../components')
const RULE_ID = 'prodily/no-raw-button'

/**
 * Mirror of RAW_BUTTON_ALLOWLIST from eslint.config.mjs.
 * Kept independent so adding an allowlist entry requires deliberate synchronization.
 */
const EXEMPT_COMPONENTS = [
  'admin/AdminAnnouncementEditorModal.tsx',
  'admin/AdminAnnouncementsView.tsx',
  'admin/AdminBadgeCard.tsx',
  'admin/AdminBroadcastModal.tsx',
  'admin/AdminBroadcastsView.tsx',
  'admin/AdminContactInbox.tsx',
  'admin/AdminCreateBroadcastModal.tsx',
  'admin/AdminCreateInAppNotificationModal.tsx',
  'admin/AdminCreateTemplateModal.tsx',
  'admin/AdminCurriculumWorkspace.tsx',
  'admin/AdminDashboardRefreshButton.tsx',
  'admin/AdminDataTable.tsx',
  'admin/AdminDrawer.tsx',
  'admin/AdminEditInAppNotificationModal.tsx',
  'admin/AdminEmailAutomationsView.tsx',
  'admin/AdminEmailDashboard.tsx',
  'admin/AdminErrorDetailDrawer.tsx',
  'admin/AdminErrorState.tsx',
  'admin/AdminHeader.tsx',
  'admin/AdminInAppNotificationView.tsx',
  'admin/AdminLeaderboardView.tsx',
  'admin/AdminLearningActivityChart.tsx',
  'admin/AdminLessonDetailView.tsx',
  'admin/AdminLessonPreview.tsx',
  'admin/AdminModal.tsx',
  'admin/AdminModuleDetailView.tsx',
  'admin/AdminPagination.tsx',
  'admin/AdminProductionSendModal.tsx',
  'admin/AdminQueueView.tsx',
  'admin/AdminRangeSelector.tsx',
  'admin/AdminRetryButton.tsx',
  'admin/AdminSearchInput.tsx',
  'admin/AdminSendTestEmailModal.tsx',
  'admin/AdminSidebar.tsx',
  'admin/AdminSystemAlertsView.tsx',
  'admin/AdminSystemAuditView.tsx',
  'admin/AdminSystemErrorsView.tsx',
  'admin/AdminSystemHealthWorkspace.tsx',
  'admin/AdminTemplateEditor.tsx',
  'admin/AdminTemplateList.tsx',
  'admin/AdminToggle.tsx',
  'admin/AdminUserMultiSelectPicker.tsx',
  'admin/AnalyticsWorkspace.tsx',
  'admin/BadgesWorkspace.tsx',
  'admin/CapstoneReviewDrawer.tsx',
  'admin/CapstonesView.tsx',
  'admin/CertificatesWorkspace.tsx',
  'admin/DeveloperActionsSection.tsx',
  'admin/EmailSettingsSection.tsx',
  'admin/FeedbackListView.tsx',
  'admin/FeedbackModerationView.tsx',
  'admin/FellowRequestsView.tsx',
  'admin/LearningSettingsSection.tsx',
  'admin/ModerationWorkspace.tsx',
  'admin/OnboardingSettingsSection.tsx',
  'admin/PortfoliosView.tsx',
  'admin/ProcessEmailQueueButton.tsx',
  'admin/ProductSettingsSection.tsx',
  'admin/SendProductionEmailModal.tsx',
  'admin/SendTestEmailButton.tsx',
  'admin/SettingsWorkspace.tsx',
  'admin/UserDetailDrawer.tsx',
  'admin/UserFellowToggle.tsx',
  'admin/UserPortfolioVerificationToggle.tsx',
  'admin/UserRoleToggle.tsx',
  'admin/UserTabPanels.tsx',
  'admin/UsersFilterBar.tsx',
  'admin/UsersWorkspace.tsx',
  'admin/admin-toast.tsx',
  'auth/ResendVerificationCard.tsx',
  'badges/BadgeNotification.tsx',
  'capstones/CapstoneCard.tsx',
  'capstones/RichEditor.tsx',
  'capstones/SubmitConfirmationModal.tsx',
  'feedback/ContextualFeedbackModal.tsx',
  'feedback/LessonFeedbackWidget.tsx',
  'feedback/error-state.tsx',
  'layout/Sidebar.tsx',
  'layout/SystemAnnouncementBanner.tsx',
  'layout/Topbar.tsx',
  'layout/navbar.tsx',
  'leaderboard/CohortsSection.tsx',
  'leaderboard/FriendAccountabilitySection.tsx',
  'leaderboard/LeaderboardHeader.tsx',
  'leaderboard/LeaderboardScopeSwitcher.tsx',
  'leaderboard/LeaderboardTable.tsx',
  'leaderboard/ProfileComparisonModal.tsx',
  'marketing/faq-explorer.tsx',
  'marketing/reviews-explorer.tsx',
  'marketing/sections/experience.tsx',
  'marketing/sections/journey.tsx',
  'marketing/sections/portfolio.tsx',
  'marketing/sections/testimonials.tsx',
  'notifications/NotificationBell.tsx',
  'notifications/NotificationCenterDrawer.tsx',
  'notifications/NotificationItemCard.tsx',
  'notifications/NotificationPreferencesTab.tsx',
  'notifications/NotificationToast.tsx',
  'portfolio/FeaturedCapstoneCard.tsx',
  'portfolio/PortfolioCapstones.tsx',
  'portfolio/ShareButton.tsx',
  'quick-start/QuickStartModal.tsx',
  'quiz/QuizOption.tsx',
  'review/QualitySelector.tsx',
  'review/ReviewComplete.tsx',
  'search/SearchOverlay.tsx',
  'settings/DangerZoneTab.tsx',
  'settings/FellowRequestCard.tsx',
  'settings/PortfolioReadinessCard.tsx',
  'settings/PortfolioSettingsForm.tsx',
  'settings/ProfileSettingsTab.tsx',
  'settings/ReferralSettingsTab.tsx',
  'settings/SecuritySettingsTab.tsx',
  'ui/accordion.tsx',
]

function lint(code: string, filename: string, allow: string[] = EXEMPT_COMPONENTS) {
  const linter = new Linter()
  return linter.verify(
    code,
    [
      {
        files: ['**/*.tsx', '**/*.jsx'],
        plugins: { prodily: prodilyPlugin },
        languageOptions: {
          ecmaVersion: 2023,
          sourceType: 'module',
          parserOptions: {
            ecmaFeatures: { jsx: true },
          },
        },
        rules: { [RULE_ID]: ['error', { allow }] },
      },
    ],
    filename
  )
}

describe('B11-C — Rule behavior: raw <button> rejected', () => {
  const newComponentFile = path.join(COMPONENTS_DIR, 'new-feature', 'FeatureCard.tsx')

  it('rejects raw <button> with text', () => {
    const messages = lint('export function Card() { return <button type="button">Action</button> }', newComponentFile)
    expect(messages.length).toBe(1)
    expect(messages[0].ruleId).toBe(RULE_ID)
    expect(messages[0].message).toContain('Raw <button> is banned in components/')
  })

  it('rejects self-closing <button />', () => {
    const messages = lint('export function Card() { return <button className="icon" /> }', newComponentFile)
    expect(messages.length).toBe(1)
    expect(messages[0].ruleId).toBe(RULE_ID)
  })

  it('accepts shared Button primitive', () => {
    const messages = lint('export function Card() { return <Button type="button">Action</Button> }', newComponentFile)
    expect(messages.length).toBe(0)
  })

  it('inherently exempts components/ui/button.tsx', () => {
    const buttonPrimitiveFile = path.join(COMPONENTS_DIR, 'ui', 'button.tsx')
    const messages = lint('export function Button() { return <button type="button" /> }', buttonPrimitiveFile)
    expect(messages.length).toBe(0)
  })

  it('exempts allowlisted legacy component paths', () => {
    const allowlistedFile = path.join(COMPONENTS_DIR, 'admin', 'AdminBadgeCard.tsx')
    const messages = lint('export function AdminBadgeCard() { return <button type="button" /> }', allowlistedFile)
    expect(messages.length).toBe(0)
  })

  it('ignores files outside components/ directory', () => {
    const pageFile = path.resolve(import.meta.dirname, '../../app/(auth)/login/page.tsx')
    const messages = lint('export default function LoginPage() { return <button /> }', pageFile)
    expect(messages.length).toBe(0)
  })
})

describe('B11-C — Repository Inventory Integrity', () => {
  function walkDir(dir: string): string[] {
    let results: string[] = []
    for (const entry of readdirSync(dir)) {
      const fullPath = path.join(dir, entry)
      const stat = statSync(fullPath)
      if (stat.isDirectory()) {
        results = results.concat(walkDir(fullPath))
      } else if (entry.endsWith('.tsx') || entry.endsWith('.jsx')) {
        results.push(fullPath)
      }
    }
    return results
  }

  it('every component with raw <button> is either components/ui/button.tsx or allowlisted', () => {
    const allFiles = walkDir(COMPONENTS_DIR)
    const filesWithRawButton: string[] = []

    for (const file of allFiles) {
      const content = readFileSync(file, 'utf8')
      if (/<button[\s>]/.test(content)) {
        const relative = path.relative(COMPONENTS_DIR, file).split(path.sep).join('/')
        filesWithRawButton.push(relative)
      }
    }

    const unexempted = filesWithRawButton.filter(
      (rel) => rel !== 'ui/button.tsx' && !EXEMPT_COMPONENTS.includes(rel)
    )

    expect(unexempted).toEqual([])
  })

  it('allowlist entries are sorted and refer to existing files', () => {
    const sorted = [...EXEMPT_COMPONENTS].sort()
    expect(EXEMPT_COMPONENTS).toEqual(sorted)

    for (const rel of EXEMPT_COMPONENTS) {
      const fullPath = path.join(COMPONENTS_DIR, rel)
      expect(() => statSync(fullPath)).not.toThrow()
    }
  })
})
