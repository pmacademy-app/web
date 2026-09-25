import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

import requireWithRoute from "./eslint-rules/require-with-route.mjs";
import noRawButton from "./eslint-rules/no-raw-button.mjs";

const prodily = {
  rules: {
    "require-with-route": requireWithRoute.rules["require-with-route"],
    "no-raw-button": noRawButton.rules["no-raw-button"],
  },
};

/**
 * B7-H — routes that deliberately do not use `withRoute`.
 *
 * This list is the complete set of exemptions. Each entry is a route that cannot
 * adopt the contract for a structural reason, not a convenience. Adding to it is a
 * reviewed change; it is not something a route can do to itself.
 *
 * Every one of these still authenticates — they are exempt from the *wrapper*, not
 * from authorization.
 */
const WRAPPER_EXEMPT_ROUTES = [
  // Authenticates by HMAC over the RAW request body. `resolveActor` cannot model
  // this without reading the body, which would consume the stream the route still
  // needs to verify the signature. Verification is constant-time and fail-closed.
  "auth/send-email-hook/route.ts",

  // Redirect-only browser endpoint: every path ends in `NextResponse.redirect`, and
  // there is no JSON envelope to put an error into. Wrapping it would let a failed
  // navigation receive an error envelope instead of the error page.
  "auth/callback/route.ts",

  // Same raw-body HMAC constraint as send-email-hook — Svix/Brevo signatures are
  // computed over the exact bytes received. See the note in lib/api/actor.ts.
  "email/webhooks/route.ts",
];

/**
 * B11-C — legacy components permitted to retain raw <button> during migration.
 *
 * B11-A adopted the Button primitive in the 10 highest-traffic components and
 * established standard variants. This allowlist captures pre-existing legacy
 * call sites so that all new components and converted feature surfaces are
 * strictly enforced, while unmigrated files are converted as they are touched.
 *
 * `components/ui/button.tsx` defines the primitive and is inherently exempt.
 */
const RAW_BUTTON_ALLOWLIST = [
  "admin/AdminAnnouncementEditorModal.tsx",
  "admin/AdminAnnouncementsView.tsx",
  "admin/AdminBadgeCard.tsx",
  "admin/AdminBroadcastModal.tsx",
  "admin/AdminBroadcastsView.tsx",
  "admin/AdminContactInbox.tsx",
  "admin/AdminCreateBroadcastModal.tsx",
  "admin/AdminCreateInAppNotificationModal.tsx",
  "admin/AdminCreateTemplateModal.tsx",
  "admin/AdminCurriculumWorkspace.tsx",
  "admin/AdminDashboardRefreshButton.tsx",
  "admin/AdminDataTable.tsx",
  "admin/AdminDrawer.tsx",
  "admin/AdminEditInAppNotificationModal.tsx",
  "admin/AdminEmailAutomationsView.tsx",
  "admin/AdminEmailDashboard.tsx",
  "admin/AdminErrorDetailDrawer.tsx",
  "admin/AdminErrorState.tsx",
  "admin/AdminHeader.tsx",
  "admin/AdminInAppNotificationView.tsx",
  "admin/AdminLeaderboardView.tsx",
  "admin/AdminLearningActivityChart.tsx",
  "admin/AdminLessonDetailView.tsx",
  "admin/AdminLessonPreview.tsx",
  "admin/AdminModal.tsx",
  "admin/AdminModuleDetailView.tsx",
  "admin/AdminPagination.tsx",
  "admin/AdminProductionSendModal.tsx",
  "admin/AdminQueueView.tsx",
  "admin/AdminRangeSelector.tsx",
  "admin/AdminRetryButton.tsx",
  "admin/AdminSearchInput.tsx",
  "admin/AdminSendTestEmailModal.tsx",
  "admin/AdminSidebar.tsx",
  "admin/AdminSystemAlertsView.tsx",
  "admin/AdminSystemAuditView.tsx",
  "admin/AdminSystemErrorsView.tsx",
  "admin/AdminSystemHealthWorkspace.tsx",
  "admin/AdminTemplateEditor.tsx",
  "admin/AdminTemplateList.tsx",
  "admin/AdminToggle.tsx",
  "admin/AdminUserMultiSelectPicker.tsx",
  "admin/AnalyticsWorkspace.tsx",
  "admin/BadgesWorkspace.tsx",
  "admin/CapstoneReviewDrawer.tsx",
  "admin/CapstonesView.tsx",
  "admin/CertificatesWorkspace.tsx",
  "admin/DeveloperActionsSection.tsx",
  "admin/EmailSettingsSection.tsx",
  "admin/FeedbackListView.tsx",
  "admin/FeedbackModerationView.tsx",
  "admin/FellowRequestsView.tsx",
  "admin/LearningSettingsSection.tsx",
  "admin/ModerationWorkspace.tsx",
  "admin/OnboardingSettingsSection.tsx",
  "admin/PortfoliosView.tsx",
  "admin/ProcessEmailQueueButton.tsx",
  "admin/ProductSettingsSection.tsx",
  "admin/SendProductionEmailModal.tsx",
  "admin/SendTestEmailButton.tsx",
  "admin/SettingsWorkspace.tsx",
  "admin/UserDetailDrawer.tsx",
  "admin/UserFellowToggle.tsx",
  "admin/UserPortfolioVerificationToggle.tsx",
  "admin/UserRoleToggle.tsx",
  "admin/UserTabPanels.tsx",
  "admin/UsersFilterBar.tsx",
  "admin/UsersWorkspace.tsx",
  "admin/admin-toast.tsx",
  "auth/ResendVerificationCard.tsx",
  "badges/BadgeNotification.tsx",
  "capstones/CapstoneCard.tsx",
  "capstones/RichEditor.tsx",
  "capstones/SubmitConfirmationModal.tsx",
  "feedback/ContextualFeedbackModal.tsx",
  "feedback/LessonFeedbackWidget.tsx",
  "feedback/error-state.tsx",
  "layout/Sidebar.tsx",
  "layout/SystemAnnouncementBanner.tsx",
  "layout/Topbar.tsx",
  "layout/navbar.tsx",
  "leaderboard/CohortsSection.tsx",
  "leaderboard/FriendAccountabilitySection.tsx",
  "leaderboard/LeaderboardHeader.tsx",
  "leaderboard/LeaderboardPopoverModal.tsx",
  "leaderboard/LeaderboardScopeSwitcher.tsx",
  "leaderboard/LeaderboardTable.tsx",
  "leaderboard/ProfileComparisonModal.tsx",
  "marketing/faq-explorer.tsx",
  "marketing/reviews-explorer.tsx",
  "marketing/sections/experience.tsx",
  "marketing/sections/testimonials.tsx",
  "notifications/NotificationBell.tsx",
  "notifications/NotificationCenterDrawer.tsx",
  "notifications/NotificationItemCard.tsx",
  "notifications/NotificationPreferencesTab.tsx",
  "notifications/NotificationToast.tsx",
  "portfolio/FeaturedCapstoneCard.tsx",
  "portfolio/PortfolioCapstones.tsx",
  "portfolio/ShareButton.tsx",
  "progress/ProgressSectionDropdown.tsx",
  "quick-start/QuickStartModal.tsx",
  "quiz/QuizOption.tsx",
  "review/QualitySelector.tsx",
  "review/ReviewComplete.tsx",
  "search/SearchOverlay.tsx",
  "settings/DangerZoneTab.tsx",
  "settings/FellowRequestCard.tsx",
  "settings/PortfolioReadinessCard.tsx",
  "settings/PortfolioSettingsForm.tsx",
  "settings/ProfileSettingsTab.tsx",
  "settings/ReferralSettingsTab.tsx",
  "settings/SecuritySettingsTab.tsx",
  "settings/SettingsTabs.tsx",
  "ui/accordion.tsx",
];

const eslintConfig = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "test-results/**",
      "coverage/**",
      "next-env.d.ts",
      "scripts/**",
    ],
  },
  {
    files: ["app/api/**/route.ts"],
    plugins: { prodily },
    rules: {
      "prodily/require-with-route": ["error", { allow: WRAPPER_EXEMPT_ROUTES }],
    },
  },
  {
    // B11-C — ban raw <button> in components/ in favor of the shared Button primitive.
    files: ["components/**/*.{tsx,jsx}"],
    plugins: { prodily },
    rules: {
      "prodily/no-raw-button": ["error", { allow: RAW_BUTTON_ALLOWLIST }],
    },
  },
  {
    // B8-G — `as unknown as` is banned inside the typed data layer.
    //
    // `lib/db/` exists because that cast, repeated at every data-access site,
    // erased the generated schema types and let F-COR-1 ship: a query selecting a
    // column that does not exist, whose error was then discarded. The layer is only
    // worth having while it cannot acquire the habit it was built to remove.
    //
    // Scoped to `lib/db/` deliberately. A repo-wide purge is explicitly out of
    // scope — most remaining casts are in tests and admin aggregation and carry no
    // correctness risk, so banning them everywhere would be churn without benefit.
    //
    // The selector matches the `unknown` hop of a double assertion and leaves an
    // ordinary `x as T` alone, which is still legitimate where a narrowing is
    // genuinely known-safe.
    files: ["lib/db/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSAsExpression > TSAsExpression > TSUnknownKeyword",
          message:
            "`as unknown as` is banned in lib/db/. This layer must be written against the generated types in types/database.ts — that cast is what hid F-COR-1. If a type is genuinely missing (an RPC absent from the generated types, say), keep the cast at the call site outside lib/db/ and document why.",
        },
      ],
    },
  },
];

export default eslintConfig;
