# AG-19: App landmarks, skip link, headings, nav state and form attributes

- **IDs closed:** plan PR-20 part 3 (UX-12 except dialogs, UX-14)
- **Milestone:** M1 Platform safety
- **Depends on:** AG-11, AG-12, AG-17 and AG-18 merged (shared layout, settings, form and fetch-calling components)
- **Size:** M
- **Parallel-safe:** no with AG-12, AG-18, AG-20 (shared layout and form components)

## Why
Keyboard and screen-reader users cannot skip the sidebar in the app, some app pages have no `h1`, the sidebar does not announce the current page, and forms miss `autoComplete` and zoom on iOS because inputs are under 16px.

## Current state (verified 2026-11-12)
- Skip link exists only in the marketing layout (`apps/web/app/(marketing)/layout.tsx:16-28`) and inside `components/quick-start/QuickStartModal.tsx`. The app shell has `<main>` with no `id` (`apps/web/components/layout/AppShell.tsx:97`).
- No `h1` in the page file of: `app/(app)/dashboard/page.tsx`, `leaderboard/page.tsx`, `notifications/page.tsx`, `progress/page.tsx`, `progress/badges/page.tsx`, `progress/capstones/page.tsx`, `academy/l/[lessonId]/page.tsx`. Some may render one in a child component: check the rendered tree, not just the file.
- `aria-current` is set in `components/layout/MobileTabBar.tsx:51` and `components/layout/Topbar.tsx:144`, not in `components/layout/Sidebar.tsx` (nav items at `:57-64`).
- Only 5 `autoComplete` attributes across `app/(auth)` and `components/settings`. Forms: `app/(auth)/login/LoginForm.tsx`, `app/(auth)/signup/SignupForm.tsx`, `app/(auth)/reset-password/page.tsx`, `components/settings/{ProfileSettingsTab,SecuritySettingsTab,PortfolioSettingsForm,ReferralSettingsTab,ConfirmDestructiveAction}.tsx`, and the onboarding form under `app/onboarding/`.
- `--color-destructive-foreground` is not defined in `apps/web/app/globals.css` (`git grep -n -e destructive-foreground -- app/globals.css` prints nothing).

## Files in scope
- `apps/web/components/layout/AppShell.tsx`, `Sidebar.tsx`, `Topbar.tsx`, `MobileTabBar.tsx`; `apps/web/app/(auth)/layout.tsx` (skip link)
- The seven app pages above (or the component that renders their heading)
- The form files above; `apps/web/components/ui/input.tsx` if the base input sets the font size
- `apps/web/app/globals.css` (one focus style, `--color-destructive-foreground`)
- Tests: `apps/web/components/__tests__/ux12-app-landmarks.test.tsx` (new; vitest only collects `.tsx` tests from `components/__tests__/`; start it with the `@vitest-environment jsdom` docblock like the existing files there), `npm run test:a11y`, `lib/__tests__/b11c-raw-button-rule.test.ts` if components change

## Out of scope
- Modals and the mobile drawer (AG-20).
- Colour tokens (AG-18). Copy rewrites beyond labels (AG-30).

## Steps
1. Add a skip link as the first focusable element in the app shell, targeting `<main id="main-content" tabIndex={-1}>`. Reuse the marketing layout's markup and classes. Do the same in `apps/web/app/(auth)/layout.tsx` so `/login` and `/signup` have one too (AG-21 checks it).
2. Make sure each app route renders exactly one `h1` (visually hidden with `sr-only` only when the design has no visible title).
3. Sidebar: `aria-current="page"` on the active item, using the same active logic as `MobileTabBar`.
4. One focus style: a `:focus-visible` ring from `--color-focus` in `globals.css`; remove conflicting per-component outlines only where they clash.
5. Forms: `autoComplete` (`email`, `current-password`, `new-password`, `name`, `username`, `url`), `inputMode` where useful, `text-base` (16px) on inputs at mobile widths, a visible or `aria-label` label for every field including the reflection textarea and the portfolio visibility switch (with `aria-checked` and a focus style).
6. Define `--color-destructive-foreground` and use it on destructive buttons.
7. Tests: render the shell and assert the skip link is first and targets `main`; render each of the seven pages (or their heading component) and assert one `h1`; render the sidebar on a route and assert `aria-current`; render the auth forms and assert `autoComplete` values.

## Acceptance checks (from `apps/web`)
- `npx vitest run components/__tests__/ux12-app-landmarks.test.tsx` passes.
- `npm run test:a11y` and `npx vitest run lib/__tests__/b11c-raw-button-rule.test.ts` pass.
- `git grep -c -e autoComplete -- 'app/(auth)' components/settings app/onboarding` per-file counts add up to at least 12.
- `npm run typecheck` and `npm run lint` pass.

## Safety
- Never run `git push`, any `supabase` command, or anything against production. The user owns the branch and the pull request.
- Do not edit `audit/`, `08-IMPLEMENTATION-PLAN.md`, `content/` or `backups/`. Never read `.env*` files.
- Do not start a dev server. Do not run the full `npm test` or `npm run build`.
- No dark mode. No em-dashes in comments, copy or docs.
- Before writing Next.js code, read the matching guide in `apps/web/node_modules/next/dist/docs/`.

Start by producing an Implementation Plan artifact for review. Do not edit files until it is approved.
