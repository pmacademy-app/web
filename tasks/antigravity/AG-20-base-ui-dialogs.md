# AG-20: Move hand-rolled modals and drawers to the base-ui Dialog

- **IDs closed:** plan PR-20 part 4 (UX-13)
- **Milestone:** M1 Platform safety
- **Depends on:** AG-19
- **Size:** M (if the diff grows past about 6 components, ship learner components first and admin components in a second PR)
- **Parallel-safe:** no with AG-11, AG-18, AG-19, AG-30

## Why
Hand-rolled overlays do not trap focus, do not always close on Escape, and are not labelled, so keyboard and screen-reader users get lost behind them. A tested primitive already exists in the repo.

## Current state (verified 2026-11-12)
- `apps/web/components/ui/dialog.tsx:4` wraps `@base-ui/react/dialog` (`@base-ui/react` is `^1.6.0` in `apps/web/package.json:70`).
- 11 components set `role="dialog"` or `aria-modal` by hand: `components/feedback/ContextualFeedbackModal.tsx`, `components/leaderboard/LeaderboardPopoverModal.tsx`, `components/notifications/NotificationCenterDrawer.tsx`, `components/quick-start/QuickStartModal.tsx`, `components/search/SearchOverlay.tsx`, `components/settings/ConfirmDestructiveAction.tsx`, `components/layout/navbar.tsx` (marketing mobile menu), `components/legal/CookieConsentBanner.tsx`, `components/admin/AdminModal.tsx`, `components/admin/AdminHeader.tsx`, `components/admin/AdminSidebar.tsx`.
- The app sidebar drawer for mobile lives in `components/layout/Sidebar.tsx` / `AppShell.tsx` (check how it opens).
- `lib/__tests__/b11c-raw-button-rule.test.ts:28` `EXEMPT_COMPONENTS` may list some of these files.

## Files in scope
- The components above that are true modal overlays. `CookieConsentBanner` is usually a non-modal banner: keep it non-modal unless it blocks the page; explain your choice.
- `apps/web/components/ui/dialog.tsx` (only if a missing variant, such as a side sheet, is needed)
- Tests: `apps/web/components/__tests__/ux13-dialogs.test.tsx` (new; `.tsx` tests are only collected from `components/__tests__/`; use the `@vitest-environment jsdom` docblock); existing tests that render these components (`git grep -l -e <ComponentName> -- lib/__tests__ components/__tests__`); `b11c-raw-button-rule.test.ts`

## Out of scope
- Visual redesign of the modals. Keep the look; change the mechanics.
- `fetch` migration inside these files (AG-11).

## Steps
1. Read `components/ui/dialog.tsx` and the base-ui Dialog docs bundled in `node_modules/@base-ui/react` (or its README) for `Root`, `Trigger`, `Portal`, `Popup`, `Title`, `Description`, `Close`.
2. For each component, list in the plan: how it opens and closes today, its title, and what should get focus on open and on close.
3. Replace the hand-rolled container with the `Dialog` primitive: labelled by a `Title`, Escape closes, focus is trapped, focus returns to the trigger, background is inert. Keep existing props and callbacks so callers do not change.
4. Mobile drawers become a side-sheet variant of the same primitive.
5. Remove any `role="dialog"`/`aria-modal` left on non-primitive elements. If a component leaves `EXEMPT_COMPONENTS` because it no longer renders a raw button, update the list (sorted) in the same change.
6. Tests: for three representative components (one learner modal, one drawer, one admin modal), open it, assert focus moves inside, Tab stays inside, Escape closes, focus returns to the trigger, and the dialog has an accessible name.

## Acceptance checks (from `apps/web`)
- `npx vitest run components/__tests__/ux13-dialogs.test.tsx lib/__tests__/b11c-raw-button-rule.test.ts` passes.
- `npm run test:a11y` passes, plus every existing test that renders a changed component.
- `git grep -l -e aria-modal -- 'app/*.tsx' 'components/*.tsx' ':!components/ui'` prints nothing (or only a justified banner).
- `npm run typecheck` and `npm run lint` pass.

## Safety
- Never run `git push`, any `supabase` command, or anything against production. The user owns the branch and the pull request.
- Do not edit `audit/`, `08-IMPLEMENTATION-PLAN.md`, `content/` or `backups/`. Never read `.env*` files.
- Do not start a dev server. Do not run the full `npm test` or `npm run build`.
- No dark mode. No em-dashes in comments, copy or docs.
- Before writing Next.js code, read the matching guide in `apps/web/node_modules/next/dist/docs/`.

Start by producing an Implementation Plan artifact for review. Do not edit files until it is approved.
