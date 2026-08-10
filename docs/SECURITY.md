# Security Threat Model & Access Control — Prodily PM Academy

**Repository:** `pmacademy-app/web`  
**Current Baseline HEAD:** `490fea37ea08813aa582fc5ebbc3896ee4eb070c`  
**Last Updated:** August 10, 2026  

---

## 1. Role-Based Access Control (RBAC) Architecture

Access to administrative features and Route Handlers (`/admin`, `/api/admin/*`) is governed by dual-layer authorization:

1. **Proxy Middleware Protection (`apps/web/proxy.ts`)**: Intercepts requests to `/admin` routes. Checks authenticated Supabase JWT session.
2. **Server-Side RBAC Engine (`lib/admin/rbac.ts`)**: Evaluates `isUserAdmin(user)`:
   - **Environment Override**: Checks if `user.email` matches `ADMIN_EMAILS` environment variable (comma-separated list).
   - **Database Role Check**: Checks if `users.is_admin === true` in PostgreSQL.

---

## 2. Row Level Security (RLS) Policies

All user-owned database tables enforce strict RLS policies:

- `users`: Users can read any profile; users can update only their own profile row (`auth.uid() = id`).
- `user_lesson_progress`: Users can read and write only their own progress (`auth.uid() = user_id`).
- `xp_events`: Users can read their own XP events; insert permitted for authenticated user (`auth.uid() = user_id`). Direct updates or deletes are DENIED.
- `notifications`: Users can read and update only their own notifications (`auth.uid() = user_id`).
- `system_errors` & `admin_audit_logs`: Read and write permitted ONLY to service-role clients. Client users have 0 access.

---

## 3. Webhook & API Authentication Security

1. **Supabase Auth Hook (`/api/auth/send-email-hook`)**:
   - Verifies requests using `SEND_EMAIL_HOOK_SECRET`.
   - Supports Bearer token, custom headers (`x-supabase-auth-secret`), query string, and Svix HMAC-SHA256 signatures.
2. **Resend Webhooks (`/api/email/webhooks`)**:
   - Verifies incoming Svix webhook signatures using `RESEND_WEBHOOK_SECRET` via `verifySvixSignature()`.
   - Rejects unsigned or tampered webhook payloads with HTTP 401.
3. **Cron Endpoints (`/api/cron/*`)**:
   - Enforces Bearer token authentication matching `CRON_SECRET`.
   - Rejects unauthorized calls with HTTP 401 and logs a warning with `logSystemError()`.

---

## 4. Secret Safety & Environment Handling

- **Server-Only Secrets**: `SUPABASE_SERVICE_ROLE_KEY`, `SEND_EMAIL_HOOK_SECRET`, `CRON_SECRET`, `RESEND_API_KEY`, and `RESEND_WEBHOOK_SECRET` are strictly server-side.
- **Client Expose Prevention**: Never import service-role client into client components (`'use client'`).
- **Secret Sanitization**: All error messages logged via `logSystemError()` pass through `sanitizeErrorDetails()`, stripping Bearer tokens, secrets, and API keys.
