# Phase 5 Plan — CI/CD & Deployment Pipeline Hardening

**Phase:** Phase 5 — CI/CD & Deployment Pipeline Hardening  
**Target:** Monorepo Workspaces (`apps/web`, `.github/workflows`, deployment configurations)  
**Objective:** Audit, harden, and verify the GitHub Actions and Vercel deployment pipeline, ensuring clean reproducibility, least-privilege permissions, robust test validation, and failure safety.

---

## 1. Baseline Architecture & Current State

1. **Monorepo Structure:**
   - Root `package.json` with npm workspaces/delegation scripts (`npm --prefix apps/web run ...`).
   - Single canonical lockfile at `apps/web/package-lock.json`.
   - Node engine requirement: Node 22 (defined in root `.nvmrc` and `apps/web/package.json`).
2. **Current GitHub Actions Workflows:**
   - `.github/workflows/ci.yml`: Main CI pipeline running on push/PR to `main`.
   - `.github/workflows/email-cron.yml`: Added during Phase 3 for email automation.
   - `.github/workflows/notification-scheduler.yml`: Earlier scheduler scaffold with overlapping schedules.
3. **Deployment Strategy:**
   - **Vercel Integration:** Native GitHub integration handles Next.js deployments (preview on PRs, production on `main`).
   - **Supabase Migrations:** GitHub Actions `deploy-supabase` job applies migrations via `npx supabase db push` on merge to `main`.

---

## 2. Security, Reliability & Performance Audit Findings

### A. Lockfile & Installation Reproducibility (`npm ci`)
- **Investigation:** Reconciled past `npm error code EUSAGE` failure.
- **Root Cause:** Prior mismatch between `package.json` devDependencies and `package-lock.json` before Phase 4 synchronization.
- **Verification:** Verified `npm ci` runs completely cleanly against `apps/web/package-lock.json` with 0 diff on the working tree.

### B. GitHub Token Permissions (Least Privilege)
- **Finding:** Neither `ci.yml` nor scheduler workflows specified explicit `permissions` blocks, inheriting repository default write tokens.
- **Remediation:**
  - `ci.yml`: Add top-level `permissions: contents: read`.
  - Scheduler workflow: Add top-level `permissions: {}` (zero token permissions needed).

### C. Concurrency Controls
- **Finding:** Rapid successive commits to PR branches trigger redundant CI runs without canceling superseded builds.
- **Remediation:** Add `concurrency: group: ${{ github.workflow }}-${{ github.ref }}, cancel-in-progress: ${{ github.event_name == 'pull_request' }}`.

### D. Duplicate & Conflicting Cron Schedulers
- **Finding:** `.github/workflows/email-cron.yml` and `.github/workflows/notification-scheduler.yml` trigger `/api/cron/process-email-queue` and `/api/cron/weekly-recap` on conflicting schedules.
- **Remediation:** Consolidate all 5 cron routines (`process-email-queue`, `retry-failed`, `daily-reminder`, `weekly-recap`, `cleanup`) into a single canonical `.github/workflows/notification-scheduler.yml` with unified inputs, standardized origin variable resolution, and remove redundant `email-cron.yml`.

### E. E2E Browser Testing in CI Quality Gate
- **Finding:** `ci.yml` previously only ran unit/integration tests (`npm run test`) and omitted Playwright E2E browser tests (`npm run test:e2e`).
- **Remediation:** In `ci.yml`, after `npm run build`, install Playwright Chromium (`npx playwright install --with-deps chromium`) and execute `npm run test:e2e` so broken UI flows fail CI before deployment.

### F. Environment Variable Isolation
- **Audit:** All server-only secrets (`SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `CRON_SECRET`, `SEND_EMAIL_HOOK_SECRET`, `RESEND_WEBHOOK_SECRET`) are correctly un-prefixed, preventing client-side bundle leakage.

---

## 3. Planned Implementation Steps

1. **Update `.github/workflows/ci.yml`**:
   - Add `permissions: contents: read`.
   - Add `concurrency` controls.
   - Add Playwright Chromium installation and `npm run test:e2e` execution step.
   - Add graceful secrets guard for `deploy-supabase` job.
2. **Consolidate `.github/workflows/notification-scheduler.yml`**:
   - Add `permissions: {}`.
   - Include all 5 cron endpoints with clean cron schedules.
   - Add manual `workflow_dispatch` input selector.
   - Standardize target URL resolution.
3. **Remove Redundant `.github/workflows/email-cron.yml`**:
   - Eliminate conflicting duplicate workflow.
4. **Execute Full Verification Matrix**:
   - `npm ci`
   - `npm run db:types`
   - `npm run typecheck`
   - `npm run lint`
   - `npm run test`
   - `npm run test:coverage`
   - `npm run test:e2e`
   - `npm run build`

---

## 4. Verification & Safety Constraints

- No application business logic or database schemas will be altered.
- All changes are strictly confined to CI workflows, test pipeline execution, and documentation.
- Working tree remains uncommitted until explicit user authorization.
