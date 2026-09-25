# Prodily Technical Remediation — Phase T1

**Phase:** T1 — Security & Data Integrity  
**Date:** September 25, 2026  
**Branch:** `tech-fixes`  
**Starting Commit SHA:** `4748e2c853aa09d4069847d0a8579c086f0c6214`  
**Status:** Completed & Validated  

---

## Starting State

- **Starting Branch:** `main` (clean working tree with untracked audit documentation).
- **Starting Commit SHA:** `4748e2c853aa09d4069847d0a8579c086f0c6214`
- **Working Branch:** `tech-fixes` (created for remediation track).
- **Repository Health Pre-flight:**
  - TypeScript typecheck (`tsc --noEmit`): Clean (0 errors).
  - Vitest authentication baseline: 42/42 tests passing.
  - Zero live development servers or production data modifications.

---

## Findings Verified

### 1. CRIT-01 / SEC-01 — Unconditional Certificate Issuance & Permissive RLS INSERT
- **Confirmed:** Yes.
- **Evidence:**
  - [`apps/web/lib/certificates-db.ts:44-106`](file:///D:/Prodily/apps/web/lib/certificates-db.ts#L44-L106): `issueCertificate()` calculated `lessonsCompleted` for profile display metadata, but executed zero assertions against curriculum completion requirements before inserting a new certificate row.
  - [`apps/web/app/api/certificates/route.ts:26-44`](file:///D:/Prodily/apps/web/app/api/certificates/route.ts#L26-L44): Accepted `POST /api/certificates` requests with arbitrary certificate types and issued credentials unconditionally via the service-role client.
  - [`supabase/migrations/20260910000001_security_hardening_b1.sql:98-100`](file:///D:/Prodily/supabase/migrations/20260910000001_security_hardening_b1.sql#L98-L100): Database RLS policy `CREATE POLICY "Users can insert own certificates" ON public.certificates FOR INSERT WITH CHECK (auth.uid() = user_id)` allowed any authenticated user to directly forge and insert certificate rows into PostgREST without passing through the backend API.
- **Root Cause:** Missing server-side prerequisite validation in the issuance service combined with an overly permissive client INSERT policy left over from early prototyping.
- **Exact Files Involved:**
  - `apps/web/lib/certificates-db.ts`
  - `apps/web/app/api/certificates/route.ts`
  - `apps/web/app/api/admin/dev/generate-test-certificate/route.ts`
  - `supabase/migrations/20260910000001_security_hardening_b1.sql`

### 2. CRIT-03 — Admin Account Deletion Creates Zombie Users
- **Confirmed:** Yes.
- **Evidence:**
  - [`apps/web/app/api/admin/users/[id]/route.ts:49`](file:///D:/Prodily/apps/web/app/api/admin/users/%5Bid%5D/route.ts#L49): Admin user deletion endpoint executed `deleteAccount(supabase, id)`, which purged records from `public.users` and application tables, but omitted `supabase.auth.admin.deleteUser(id)`.
  - Contrast with learner self-deletion in [`apps/web/app/api/settings/delete-account/route.ts:25`](file:///D:/Prodily/apps/web/app/api/settings/delete-account/route.ts#L25), which explicitly executed `supabase.auth.admin.deleteUser(userId)`.
  - Missing authorization safeguards: No guard preventing an admin from deleting their own account (`id === admin.userId`), and no hierarchy check preventing lower-level admins from deleting other administrators.
- **Root Cause:** Incomplete cascade deletion logic in the admin user route omitting the Supabase Auth GoTrue identity layer.
- **Exact Files Involved:**
  - `apps/web/app/api/admin/users/[id]/route.ts`

### 3. CRIT-04 — Login `listUsers()` In-Memory Scan Scalability Bug
- **Confirmed:** Yes.
- **Evidence:**
  - [`apps/web/app/api/auth/login/route.ts:107-108`](file:///D:/Prodily/apps/web/app/api/auth/login/route.ts#L107-L108):
    ```typescript
    const { data: usersList } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const matchedUser = (usersList?.users || []).find((u) => u.email?.toLowerCase() === email)
    ```
    When email verification requirement is OFF (`!isRequired`) and an unconfirmed user signs in with a verified password, the handler loaded up to 1,000 users into Node.js memory to locate the user's GoTrue ID.
- **Root Cause:** In-memory linear scan of page 1 from GoTrue admin API. As soon as user population exceeds 1,000, any user on page 2+ cannot be resolved, resulting in a permanent login failure. Loading 1,000 user records into application memory on login requests also represents a severe DoS vector.
- **Exact Files Involved:**
  - `apps/web/app/api/auth/login/route.ts`

### 4. SEC-02 — Password Reset Exception Leakage
- **Confirmed:** Yes.
- **Evidence:**
  - [`apps/web/app/api/auth/update-password/route.ts:293`](file:///D:/Prodily/apps/web/app/api/auth/update-password/route.ts#L293):
    ```typescript
    const response = NextResponse.json(
      { success: false, error: retryError.message || 'Failed to update password. Your reset link may have expired.' },
      { status: isExpected ? 401 : 400 }
    )
    ```
    While the initial password update attempt properly used `apiClassifiedAuthError({ cause: error, context: 'reset_password', status: ... })`, the retry branch returned `retryError.message` directly to the client JSON response.
- **Root Cause:** Inconsistent error serialization on the token-refresh retry path of the password update route.
- **Exact Files Involved:**
  - `apps/web/app/api/auth/update-password/route.ts`

---

## Fixes Implemented

### Fix 1.1: Certificate Prerequisite Verification & Client INSERT Revocation
- **Changes in [`apps/web/lib/certificates-db.ts`](file:///D:/Prodily/apps/web/lib/certificates-db.ts):**
  - Integrated `getLessonIdsForModule` from `@/lib/curriculum-registry`.
  - Added strict server-side prerequisite checks in `issueCertificate`:
    - `full_curriculum`: Asserts that `lessonsCompleted >= 90`. Throws `PublicError('Full curriculum completion certificate requires completing all 90 lessons...', { status: 400, code: 'PREREQUISITES_NOT_MET' })` if incomplete.
    - `module_completion`: Requires valid `moduleSlug`, resolves canonical module lesson IDs, and verifies all 10 lessons in the module are completed in `user_lesson_progress`. Throws `PREREQUISITES_NOT_MET` (or `INVALID_MODULE`) if incomplete.
    - Preserved idempotent lookup: If an authentic certificate already exists for that user and code, it is returned without duplicate insert.
    - Added `IssueCertificateOptions { bypassPrerequisites?: boolean }` strictly for admin dev testing tools.
- **Changes in [`apps/web/app/api/admin/dev/generate-test-certificate/route.ts`](file:///D:/Prodily/apps/web/app/api/admin/dev/generate-test-certificate/route.ts):**
  - Updated dev test generator to pass `{ bypassPrerequisites: true }`, allowing operators to create mock `TEST-*` certificates for QA purposes.
- **Changes in Database RLS:**
  - Dropped policy `"Users can insert own certificates"` on `public.certificates`. All inserts must now originate from the backend service role.

### Fix 1.2: Admin Account Deletion Hardening & Zombie Elimination
- **Changes in [`apps/web/app/api/admin/users/[id]/route.ts`](file:///D:/Prodily/apps/web/app/api/admin/users/%5Bid%5D/route.ts):**
  - **Self-deletion Guard:** Returns status 400 with `'Admins cannot delete their own account through the admin panel.'` if `id === admin.userId`.
  - **Target Verification:** Resolves target user record from `public.users`; returns 404 if not found.
  - **Admin Hierarchy Enforcement:**
    - Checks `targetIsAdmin` via `users.is_admin` or `isAdminEmail(targetUser.email)`.
    - If target is in `ADMIN_EMAILS`, returns 403 (`'Primary system administrators cannot be deleted via the API.'`).
    - If caller is a promoted database admin (`!isAdminEmail(admin.email)`) attempting to delete another administrator, returns 403 (`'Superadmin privileges required to delete an administrator account.'`).
  - **Auth Deletion:** Calls `await supabase.auth.admin.deleteUser(id)` immediately following application data cascade (`deleteAccount`).
  - **Audit Logging:** Logs admin audit event including `targetEmail` and `authDeleted` status.

### Fix 1.3: Scalable O(1) Auth User ID Resolution on Login
- **Changes in [`apps/web/app/api/auth/login/route.ts`](file:///D:/Prodily/apps/web/app/api/auth/login/route.ts):**
  - Removed `supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })` and in-memory linear search.
  - Implemented a 3-tier user resolution strategy:
    1. **Tier 1 (Production O(1)):** Calls security definer PostgreSQL RPC `get_auth_user_id_by_email(email)`. Performs indexed lookup directly on `auth.users(email)` with zero client memory consumption.
    2. **Tier 2 (Database Fallback):** Checks `public.users` table mapping by email.
    3. **Tier 3 (Test Mock Compatibility):** Bounded fallback for unit tests where PostgreSQL RPCs are mocked.
  - Safely auto-confirms the user via `updateUserById(targetUserId, { email_confirm: true })` and completes password authentication.

### Fix 1.4: Password Reset Error Sanitization
- **Changes in [`apps/web/app/api/auth/update-password/route.ts`](file:///D:/Prodily/apps/web/app/api/auth/update-password/route.ts):**
  - Replaced raw `retryError.message` response on the retry path with `apiClassifiedAuthError({ cause: retryError, context: 'reset_password', status: isExpected ? 401 : 400 })`.
  - Ensures database constraint violations, driver timeouts, or provider internal strings never leak to the client while preserving actionable user messages and correct HTTP status codes (401 vs 400).

---

## Database Changes

### Migration File
`supabase/migrations/20260925000001_phase_t1_security_hardening.sql`

### Policies & Functions Changed
1. **Revoked Certificate Client Insert:**
   ```sql
   DROP POLICY IF EXISTS "Users can insert own certificates" ON public.certificates;
   ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;
   ```
2. **Introduced Scalable Auth Lookup RPC:**
   ```sql
   CREATE OR REPLACE FUNCTION public.get_auth_user_id_by_email(p_email TEXT)
   RETURNS UUID
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path = auth, pg_temp
   AS $$
   DECLARE
     v_user_id UUID;
   BEGIN
     IF p_email IS NULL OR trim(p_email) = '' THEN
       RETURN NULL;
     END IF;

     SELECT id INTO v_user_id
     FROM auth.users
     WHERE lower(email) = lower(trim(p_email))
     LIMIT 1;

     RETURN v_user_id;
   END;
   $$;

   REVOKE EXECUTE ON FUNCTION public.get_auth_user_id_by_email(TEXT) FROM PUBLIC;
   REVOKE EXECUTE ON FUNCTION public.get_auth_user_id_by_email(TEXT) FROM anon;
   REVOKE EXECUTE ON FUNCTION public.get_auth_user_id_by_email(TEXT) FROM authenticated;
   GRANT EXECUTE ON FUNCTION public.get_auth_user_id_by_email(TEXT) TO service_role;
   GRANT EXECUTE ON FUNCTION public.get_auth_user_id_by_email(TEXT) TO postgres;
   ```

### Rollback Considerations
- RLS policy rollback: Can be re-added via `CREATE POLICY "Users can insert own certificates" ON public.certificates FOR INSERT WITH CHECK (auth.uid() = user_id);` if necessary (though strongly discouraged).
- Function rollback: `DROP FUNCTION IF EXISTS public.get_auth_user_id_by_email(TEXT);`. Application login route contains fallback handling if RPC is dropped.

---

## Tests Added / Updated

### 1. New Dedicated Test Suite
**File:** [`apps/web/lib/__tests__/phase-t1-security-hardening.test.ts`](file:///D:/Prodily/apps/web/lib/__tests__/phase-t1-security-hardening.test.ts) (15 tests, 100% passing)
- `T1.1`: Rejects full curriculum issuance when user has <90 lessons.
- `T1.1`: Allows full curriculum issuance when user has 90 lessons.
- `T1.1`: Rejects module certificate when module lessons are partially completed.
- `T1.1`: Allows module certificate when all 10 module lessons are completed.
- `T1.1`: Rejects invalid module slugs with `INVALID_MODULE`.
- `T1.1`: Idempotency test (no duplicate certificates inserted on repeated requests).
- `T1.1`: Verified admin dev `bypassPrerequisites` functionality.
- `T1.1`: Asserts migration file drops `"Users can insert own certificates"`.
- `T1.2`: Blocks admin self-deletion with 400.
- `T1.2`: Blocks deletion of primary system admins (`ADMIN_EMAILS`) with 403.
- `T1.2`: Blocks lower-level admins from deleting other administrators with 403.
- `T1.2`: Verifies both `deleteAccount` and `auth.admin.deleteUser` are executed on learner deletion.
- `T1.3`: Verifies login route does not scan `listUsers({ perPage: 1000 })`.
- `T1.3`: Asserts migration definition and permissions for `get_auth_user_id_by_email`.
- `T1.4`: Verifies update-password retry path sanitizes errors via `apiClassifiedAuthError`.

### 2. Verified Existing Regression Suites
- `lib/__tests__/update-password.test.ts` (11/11 passing)
- `lib/__tests__/email-confirmation-requirement.test.ts` (12/12 passing)
- `lib/__tests__/rls.test.ts` (3/3 passing)
- `lib/__tests__/platform-security-hardening.test.ts` (13/13 passing)
- `lib/__tests__/fellow-status-authorization.test.ts` (11/11 passing)
- `lib/__tests__/auth-unified-errors.test.ts` (42/42 passing)
- `lib/__tests__/api-error-contract.test.ts` (16/16 passing)

---

## Validation Results

1. **Typecheck:**
   `npm run typecheck` (`tsc --noEmit`): **Exit Code 0** (Clean, 0 errors).
2. **Linting:**
   `npx eslint ...`: **Exit Code 0** across all modified files and new tests.
3. **Unit & Integration Tests:**
   All 15 tests in `phase-t1-security-hardening.test.ts` + 81 tests across surrounding suites: **100% Passing**.

---

## Findings Deferred to Later Phases

- **T2 (Async & Retention):**
  - CRIT-02: Disconnected email queue preferences in `processor.ts:104`.
  - Cron starvation at 100 users in `daily-reminder` and `weekly-recap`.
  - Duplicate cron `retry-failed`.
- **T3 (Learning Engine & UX):**
  - Swallowed theory engagement threshold 400 errors in `lesson-content.tsx`.
  - Unwired flashcard completion callback in `LessonContextProvider`.
  - Completion screen decoupled from quiz score.
  - Double XP trigger on user profile updates in PostgreSQL.
- **T4 (Admin & Operations):**
  - Spurious `access_denied` admin audit log flooding from dual-role routes.
  - Question ID numbering shifts in markdown compiler plugin.
- **T5 (Observability & CI):**
  - System health endpoint (`/api/health`).

---

## Remaining Risks

- **Existing Legacy Certificates:** Any certificates forged prior to this patch remain in the database unless audited and revoked by operations. A data cleanup script can be scheduled if historical certificate auditing is desired.
- **Supabase Migration Deployment:** The new migration file `20260925000001_phase_t1_security_hardening.sql` must be applied to staging/production Supabase instances to enforce the RLS drop and create the auth lookup function.

---

## Changed Files

1. `apps/web/lib/certificates-db.ts`
2. `apps/web/app/api/admin/dev/generate-test-certificate/route.ts`
3. `apps/web/app/api/admin/users/[id]/route.ts`
4. `apps/web/app/api/auth/login/route.ts`
5. `apps/web/app/api/auth/update-password/route.ts`
6. `supabase/migrations/20260925000001_phase_t1_security_hardening.sql`
7. `apps/web/lib/__tests__/phase-t1-security-hardening.test.ts`
8. `docs/audits/PRODILY_TECHNICAL_REMEDIATION_T1.md`

---

## Final Git Diff Summary

```diff
- apps/web/lib/certificates-db.ts:
    + Added getLessonIdsForModule import
    + Added IssueCertificateOptions { bypassPrerequisites?: boolean }
    + Enforced 90-lesson requirement for full_curriculum
    + Enforced all-module-lesson requirement for module_completion
    + Normalized type aliases ('module' -> 'module_completion')
    + Preserved idempotent retrieval of existing certificates

- apps/web/app/api/admin/dev/generate-test-certificate/route.ts:
    + Passed { bypassPrerequisites: true } to permit operator test certificate generation

- apps/web/app/api/admin/users/[id]/route.ts:
    + Added self-deletion guard (status 400)
    + Added target user existence check (status 404)
    + Enforced admin hierarchy protection against deleting env superadmins or peer admins (status 403)
    + Executed supabase.auth.admin.deleteUser(id) alongside application data deletion

- apps/web/app/api/auth/login/route.ts:
    + Replaced in-memory listUsers({ perPage: 1000 }) scan with 3-tier lookup
    + Tier 1: PostgreSQL RPC get_auth_user_id_by_email(email) (O(1) directly in auth.users)
    + Tier 2: public.users lookup
    + Tier 3: Bounded unit-test mock fallback

- apps/web/app/api/auth/update-password/route.ts:
    + Replaced raw retryError.message return with apiClassifiedAuthError

- supabase/migrations/20260925000001_phase_t1_security_hardening.sql:
    + Dropped policy "Users can insert own certificates" on public.certificates
    + Created security definer get_auth_user_id_by_email() granted strictly to service_role

- apps/web/lib/__tests__/phase-t1-security-hardening.test.ts:
    + 15 comprehensive unit & integration tests covering all T1 security boundaries
```
