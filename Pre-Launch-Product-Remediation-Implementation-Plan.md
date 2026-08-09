# Pre-Launch Product Remediation Implementation Plan (Revised)

> **Document Status:** Revised Planning & Architecture Review  
> **Target Release:** Prodily PM Academy v1.0.0 (Public Launch)  
> **Canonical Domain:** `https://prodily.adityagangwani.me`  
> **Intended Receiving Inbox:** `pmacademyapp@gmail.com`  
> **Public Support Address:** `hello@prodily.adityagangwani.me`  

---

## 1. Executive Summary

This revised document serves as the canonical technical blueprint for resolving the **9 critical product remediation areas** required prior to the public launch of **Prodily PM Academy**. 

All architectural recommendations have been updated following strict review principles:
- **No Unnecessary Custom Encoders:** Prefer a mature, well-tested QR generation library compatible with Next.js/SSR over custom bitwise matrix builders.
- **Server-Authoritative Milestones:** Client-side active time tracking acts strictly as a measurement mechanism; server-persisted milestone records (`user_feedback_prompts`) prevent duplicate prompts across devices, tabs, or clearing `localStorage`.
- **Strict Private Feedback vs. Public Testimonials:** Private product feedback (`user_feedback`) is kept completely isolated from public testimonials (`testimonials`). Feedback never automatically becomes a public review. Public reviews require deliberate learner action, explicit opt-in, and Admin approval (`Pending → Approved/Rejected → Published/Unpublished`).
- **Verified Resend Inbound Pipeline:** Website contact form processing (Outbound alert to `pmacademyapp@gmail.com`) is strictly separated from direct inbound email receiving (`hello@prodily.adityagangwani.me`). Exact MX records, webhook signatures, and forwarding capabilities must be verified during implementation before DNS changes.
- **Infrastructure Security for Admin Privileges:** `Toggle Admin Role` is removed from the operational console; Admin privileges remain controlled infrastructure config (`ADMIN_EMAILS`). Admin email authorization is strictly separated from contact query inbox routing (`pmacademyapp@gmail.com`).
- **Scope Discipline:** Certificate revocation/re-issue is marked as **Optional / Post-Launch** as current PRD requirements specify permanent credential issuance.

---

## 2. Current Architecture Findings

1. **Authentication & RBAC:** Auth uses Supabase Auth with server-persisted HTTP-only cookies (`/api/auth/session`). Admin authorization is strictly derived from `ADMIN_EMAILS` environment matches or `users.is_admin = true` checked server-side (`lib/admin/guard.ts`). `pmacademyapp@gmail.com` is the contact inquiry recipient and is NOT automatically granted Admin access.
2. **Notification Platform:** Event-driven architecture (`lib/notifications/`). Events dispatch through `NotificationEventDispatcher` -> Connectors -> `createInAppNotification()` -> `in_app_notifications` table in Supabase. Client UI (`NotificationBell.tsx`) currently polls `/api/notifications` on a 60-second timer.
3. **Certificates & QR Code:** Certificates issue deterministic codes (`PMA-YYYY-8HEX`). `generateQrCodeSvg()` in `lib/certificates.ts` currently uses pseudo-random bitwise hashing instead of standard ISO/IEC 18004 QR matrices, producing non-scannable SVG grids.
4. **Email & Resend Infrastructure:** Outbound email uses Resend API via `/api/auth/send-email-hook` and background queue (`email_queue`). Contact page (`/contact`) currently lacks an interactive DB submission route and does not connect Resend Inbound Receiving to `pmacademyapp@gmail.com`.
5. **Feedback & Testimonials:** Database table `testimonials` exists. `POST /api/feedback` currently writes un-categorized rows into `testimonials`. Private product feedback is currently conflated with public testimonials, and no contextual prompt engine exists for 1-hour usage or module completion.
6. **Admin Console:** Operational shell exists at `/admin` with 7 tabs. Read-heavy; missing controlled server-side mutation endpoints for user inspection, progress resets, contact query resolution, and testimonial moderation. Unrestricted database editing is explicitly prohibited.
7. **Settings Reset:** Reset routes (`/api/settings/reset/*`) execute targeted deletes on `user_lesson_progress`, `quiz_attempts`, `user_flashcard_srs`, and insert negative XP ledger events. Functionality is mathematically sound, preserving user identity and issued legal certificates, but requires typed UI confirmation and cache revalidation.

---

## 3. Feature-by-Feature Analysis (9 Areas)

---

### Area 1: Real-Time / Actionable Event Notifications

#### 1. Current State
- **Existing System:** Notification platform in `lib/notifications/`. `EventEnvelope` emitted on events (`lesson.completed`, `quiz.completed`, `module.completed`, `badge.earned`, `xp.level_up`, `certificate.generated`). Connectors write to `in_app_notifications` table.
- **Existing UI:** `NotificationBell.tsx` displays unread count; `NotificationCenterDrawer.tsx` displays date-grouped notification cards.
- **Working:** Backend creation of in-app notification rows in Supabase.
- **Missing:** Instant client-side UI update when an event occurs in the active session; floating toast / congratulatory banner; client event bus to update `NotificationBell` without waiting for the 60-second polling timer.

#### 2. Root Cause / Gap Analysis
- The backend creates `in_app_notifications` rows inside server API routes, but there is no client-side broadcast mechanism notifying open browser tabs in the active session.
- `NotificationBell` relies purely on `setInterval(..., 60000)` HTTP polling.

#### 3. Recommended Final Implementation
- **Client Event Bus:** Create a lightweight browser event bus (`lib/events/client-event-bus.ts`) using standard `window.dispatchEvent(new CustomEvent('pma:notification-emitted', { detail }))`.
- **Immediate Toast Feedback:** Integrate an active session toast component (`components/notifications/NotificationToast.tsx`) that listens to `pma:notification-emitted` and renders a floating congratulatory badge (+100 XP, Badge Unlocked, Module Complete).
- **Instant Bell Refresh:** `NotificationBell` subscribes to `pma:notification-emitted` and re-fetches or increments `unreadCount` instantly.
- **Deduplication:** API endpoints track `eventId` to prevent duplicate row creation if a request is retried.

#### 4. Data Model / Database Impact
- **Reused Tables:** `in_app_notifications`, `notification_events`.
- **New Columns:** None required.
- **RLS:** Existing RLS on `in_app_notifications` (`auth.uid() = user_id`) is reused.

#### 5. Security / Authorization
- Notifications are strictly user-scoped via `auth.uid()`. Service-role key is used only in server-side API connectors.

#### 6. UX / UI Plan
```
User completes quiz / theory read
→ API POST /api/v2/lessons/[lessonId]/quiz returns { xpEarned, badgeUnlocked, notification }
→ Client emits CustomEvent('pma:notification-emitted')
→ Floating NotificationToast slides in with "+50 XP • Quiz Passed!"
→ NotificationBell unread badge increments immediately (+1)
→ Opening NotificationCenterDrawer shows the new notification at top of "Today"
```

#### 7. Edge Cases
- **Page Reload:** Unread row is loaded from DB on next mount.
- **Multiple Tabs:** 60-second polling acts as fallback sync across background tabs.
- **Offline / Failed API:** Toast is only shown upon confirmed HTTP 200 response from backend.

#### 8. Testing Plan
- **Unit Test:** Test event envelope payload builder in `lib/__tests__/notifications.test.ts`.
- **Integration Test:** Verify `createInAppNotification()` inserts DB row correctly.
- **Browser Verification:** Complete a quiz in UI; verify toast appears and Bell unread count increments without page refresh.

#### 9. Manual Actions Required
- `Not required.`

---

### Area 2: GitHub-Style Notification Side Panel / Drawer UX

#### 1. Current State
- **Existing Component:** `apps/web/components/notifications/NotificationCenterDrawer.tsx`.
- **Working:** Slide-over panel, backdrop blur, category filter tabs (`All`, `Unread`, `Achievements`, `Learning`, `Security`), date grouping (`Today`, `Yesterday`, `This Week`, `Earlier`), mark as read/unread, mark all as read.
- **Missing:** Mobile full-screen responsive tuning, keyboard focus trap refinement, and smooth action deep-linking.

#### 2. Root Cause / Gap Analysis
- Drawer is responsive, but needs smooth focus return to `triggerButtonRef` when closed via `ESC` key, and explicit `role="dialog"` accessibility attributes for screen readers.

#### 3. Recommended Final Implementation
- Refine `NotificationCenterDrawer.tsx` with robust focus trapping, aria-modal attributes, smooth exit animations, and direct navigation links to `/settings?tab=notifications` and specific action URLs.

#### 4. Data Model / Database Impact
- Reuses existing `in_app_notifications` table.

#### 5. Security / Authorization
- Users can only fetch and update their own notifications (`auth.uid() = user_id`).

#### 6. UX / UI Plan
```
User clicks Bell (or presses shortcut)
→ Drawer slides in from right with backdrop blur
→ Active tab defaults to "All" (or "Unread" if unread > 0)
→ User clicks notification item -> marks as read -> navigates to actionUrl (/academy, /badges, /verify/PMA-...)
→ Pressing ESC or clicking backdrop closes panel -> focus returns cleanly to Bell button
```

#### 7. Edge Cases
- **Zero Notifications:** Renders clean empty state with icon and callout.
- **Error State:** Renders inline "Retry Loading" button.

#### 8. Testing Plan
- Test opening/closing via keyboard (`Tab`, `Space`, `Enter`, `ESC`).
- Test responsiveness on iPhone (375px) and Desktop (1440px).

#### 9. Manual Actions Required
- `Not required.`

---

### Area 3: DB-Backed Feedback System & Contextual Prompts

#### 1. Current State
- **Existing Table:** `testimonials` table in Supabase stores `user_id`, `content`, `source_event`, `status`, `is_published`.
- **Existing API:** `POST /api/feedback` calls `FeedbackAdminService.submitFeedback()`.
- **Missing:** Contextual feedback prompt trigger engine; active usage time tracker (~1 hour milestone); explicit distinction between private feedback vs public testimonial; modal prompt component triggered after Module completion or Capstone completion.

#### 2. Root Cause / Gap Analysis
- Feedback API currently dumps all feedback into `testimonials` table as un-categorized rows without tracking whether the submission was intended as private product feedback or a public testimonial review.
- Client-side active time tracking alone is fragile if `localStorage` is cleared or devices change.

#### 3. Recommended Final Implementation
- **Strict Data Isolation (Feedback vs. Testimonial):**
  - **`user_feedback` table:** Stores private product feedback (suggestions, bug reports, feature requests). Private feedback is **NEVER** publicly displayed.
  - **`testimonials` table:** Stores public reviews with rating (1–5 stars), headline, author role, and explicit opt-in.
- **Server-Authoritative Milestone State:**
  - Client-side `useUsageTimeTracker()` measures active browser time (pausing when `document.hidden === true`) and syncs cumulative seconds to `users.total_active_seconds` or checks prompt eligibility via `POST /api/feedback/check-eligibility`.
  - Table `user_feedback_prompts` stores `(user_id, prompt_key, action)`. Server-side check ensures **each milestone prompt appears AT MOST ONCE per user**, regardless of device changes or `localStorage` clearing.
- **Contextual Feedback Modal (`components/feedback/ContextualFeedbackModal.tsx`):**
  - Triggers when:
    1. User completes any Module (`module_completion`).
    2. User submits a Capstone (`capstone_submission`).
    3. User reaches >= 3600 seconds (1 hour) of active site usage (`usage_1hr`).
- **Persistent Feedback Entry Point:** Add a "Give Feedback" button in Dashboard header and Settings page.

#### 4. Data Model / Database Impact
- **New Table `user_feedback`:**
  ```sql
  create table if not exists user_feedback (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references users(id) on delete cascade,
    category text not null default 'general', -- 'bug' | 'feature' | 'curriculum' | 'general'
    source_event text not null, -- 'module_completion' | 'capstone_submission' | 'usage_1hr' | 'manual'
    content text not null,
    rating integer check (rating between 1 and 5),
    page_url text,
    status text not null default 'new', -- 'new' | 'reviewed' | 'archived'
    created_at timestamptz not null default now()
  );
  ```
- **New Table `user_feedback_prompts`:**
  ```sql
  create table if not exists user_feedback_prompts (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references users(id) on delete cascade,
    prompt_key text not null, -- 'module_1' | 'capstone_1' | 'usage_1hr'
    action text not null, -- 'submitted' | 'dismissed'
    created_at timestamptz not null default now(),
    unique(user_id, prompt_key)
  );
  ```
- **RLS:** Users can insert their own rows (`auth.uid() = user_id`); Admins can select all.

#### 5. Security / Authorization
- Authenticated users can insert feedback. Rate limited to 5 submissions per minute via `lib/rate-limit.ts`.

#### 6. UX / UI Plan
```
Private Feedback Lifecycle:
Learner submits feedback (prompt or manual link)
→ POST /api/feedback -> Inserts row into user_feedback
→ Saved as Private -> Status = 'new'
→ Exposed ONLY in Admin Console (/admin/feedback) -> Read/Reviewed/Archived

Public Testimonial Lifecycle (Separate Action):
Learner explicitly opens Testimonial modal (e.g. after earning certificate)
→ Checks "Feature my review on the public homepage" + enters rating & headline
→ POST /api/testimonials -> Inserts row into testimonials with status = 'pending', is_published = false
→ Admin reviews in Admin Console -> Clicks "Approve & Publish"
→ Status becomes 'approved', is_published becomes true -> Featured on homepage
```

#### 7. Edge Cases
- **Tab Hidden / Inactive:** Usage timer pauses when `document.hidden === true`.
- **LocalStorage Cleared / Device Swapped:** Server-side `user_feedback_prompts` check prevents prompt re-triggering.

#### 8. Testing Plan
- Test usage tracker timer pause on tab hidden.
- Test API `POST /api/feedback` and `POST /api/testimonials` isolation.
- Test RLS policies for `user_feedback` and `user_feedback_prompts`.

#### 9. Manual Actions Required
- **Required:** Execute migration `20260810000001_create_user_feedback_tables.sql` in Supabase CLI / Dashboard.

---

### Area 4: Contact Us & Query System

#### 1. Current State
- **Existing Page:** `app/(marketing)/contact/page.tsx` displays static text pointing to `BRAND.supportEmail`.
- **Missing:** Interactive Contact Form component (`components/contact/ContactForm.tsx`); API endpoint `POST /api/contact`; database table `contact_messages`; email alert forwarding to `pmacademyapp@gmail.com`; Admin view for managing inquiries.

#### 2. Root Cause / Gap Analysis
- Contact page is currently a static text display without interactive form submission or backend processing.

#### 3. Recommended Final Implementation
- **Contact Form Component:** Build `ContactForm.tsx` supporting fields: `name`, `email`, `subject`, `message`, `category`. Works for both logged-out visitors and logged-in learners (auto-fills name/email for logged-in users).
- **API Route `POST /api/contact` (Flow A):**
  - Validates input fields and rate limits (3 requests per 10 minutes per IP/User).
  - Inserts row into `contact_messages` table in Supabase.
  - Uses `enqueueNotificationItem()` / Resend to send an alert email to `pmacademyapp@gmail.com` with:
    - Subject: `[PM Academy Inquiry] ${subject}`
    - Sender: `Prodily PM Academy Support <welcome@prodily.adityagangwani.me>`
    - Reply-To: `${userEmail}`
  - Sends a confirmation email to the user ("We received your message").
- **Admin Management:** Expose contact submissions under `/admin/communications` with status toggles (`new`, `in_progress`, `replied`, `archived`).

#### 4. Data Model / Database Impact
- **New Table `contact_messages`:**
  ```sql
  create table if not exists contact_messages (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references users(id) on delete set null,
    name text not null,
    email text not null,
    subject text not null,
    category text not null default 'general',
    message text not null,
    status text not null default 'new', -- 'new' | 'in_progress' | 'replied' | 'archived'
    source text not null default 'web_form', -- 'web_form' | 'inbound_email'
    admin_notes text,
    created_at timestamptz not null default now()
  );
  ```
- **RLS:** Public insert allowed with check (`email IS NOT NULL`); Admin select/update allowed.

#### 5. Security / Authorization
- Rate limited via IP and User ID to prevent spam. Input length bounded to max 2000 chars. `pmacademyapp@gmail.com` receives email alerts but is NOT granted Admin role privileges unless configured in `ADMIN_EMAILS`.

#### 6. UX / UI Plan
```
Visitor on /contact fills out form
→ Submits -> POST /api/contact
→ Instant UI success message: "Thank you! We received your message."
→ Outbound email sent to pmacademyapp@gmail.com with Reply-To set to visitor email
→ Inquiry row exposed in Admin Console (/admin/communications)
```

#### 7. Edge Cases
- **Invalid Email:** Validated with regex before processing.
- **Spam Submissions:** Honeypot field + IP rate limiting.

#### 8. Testing Plan
- Test POST /api/contact with valid and invalid emails.
- Verify email forwarding logic using test suite `npm run test:send-email-hook`.

#### 9. Manual Actions Required
- **Required:** Execute migration `20260810000002_create_contact_messages_table.sql`.

---

### Area 5: Resend Inbound Email Receiving (`hello@prodily.adityagangwani.me`)

#### 1. Current State
- **Sending Domain:** `prodily.adityagangwani.me` configured for outbound emails via Resend.
- **Missing:** Verified Inbound Email Receiving configuration for emails sent to `hello@prodily.adityagangwani.me`.

#### 2. Root Cause / Gap Analysis
- Resend outbound API sends emails cleanly. Inbound email receiving requires verifying Resend's supported receiving configuration, MX records, and webhook payload format during implementation before DNS changes are applied.

#### 3. Recommended Final Implementation
- **Verification-First Implementation Flow B (Direct Inbound Email):**
  1. Audit current Resend domain setup for `prodily.adityagangwani.me` to confirm receiving status and exact MX target hostname.
  2. Configure DNS MX record for `prodily.adityagangwani.me` based on verified Resend instructions.
  3. Implement webhook endpoint `POST /api/email/webhooks`:
     - Verify Svix/Resend signature header (`RESEND_WEBHOOK_SECRET`).
     - Extract `from`, `to`, `subject`, `text`, `html` fields.
     - Insert row into `contact_messages` (`source = 'inbound_email'`).
     - Trigger outbound email via Resend forwarding formatted message to `pmacademyapp@gmail.com`.

#### 4. Data Model / Database Impact
- Reuses `contact_messages` table (`source = 'inbound_email'`).

#### 5. Security / Authorization
- Webhook route validates Svix HMAC signature using `RESEND_WEBHOOK_SECRET`.

#### 6. Manual Actions Required
- **Required only if the implementation uses Resend Receiving architecture:**
  - Verify Resend Inbound Email receiving capability in Resend Dashboard.
  - Add designated MX record for `prodily.adityagangwani.me` in Cloudflare / DNS.
  - Set Resend Webhook URL to `https://prodily.adityagangwani.me/api/email/webhooks`.
  - Set `RESEND_WEBHOOK_SECRET` in environment variables.

---

### Area 6: Real DB-Backed Testimonial & Moderation System

#### 1. Current State
- **Existing Table:** `testimonials` table in Supabase (`id`, `user_id`, `source_event`, `content`, `status`, `is_published`, `reviewed_by`, `reviewed_at`, `created_at`).
- **Existing Backend:** `FeedbackAdminService` has `getModerationQueue()` and `moderateTestimonial()`.
- **Existing API:** `GET /api/testimonials` returns approved & published rows.
- **Missing:** Public review submission form for learners with star ratings and Admin moderation UI controls.

#### 2. Root Cause / Gap Analysis
- Currently no explicit learner-facing form allows submitting a public testimonial review with rating and display opt-in.

#### 3. Recommended Final Implementation
- **Schema Update:** Add `rating` (1–5 stars), `headline`, `author_role` (e.g. "Senior PM at Tech Co"), and `is_featured` boolean to `testimonials` table.
- **Testimonial Form Component (`components/testimonials/TestimonialSubmissionModal.tsx`):**
  - Deliberate user action allowing learners to submit a headline, rating, review text, and public display permission.
  - Submits to `POST /api/testimonials`.
- **Admin Moderation Console (`/admin/testimonials`):**
  - Displays moderation queue cards: `Pending`, `Approved`, `Published`, `Rejected`.
  - Actions: **Approve**, **Publish to Homepage**, **Unpublish**, **Edit Text**, **Feature**.
  - Full audit logging via `logAdminAction()`.

#### 4. Data Model / Database Impact
- **Alter Table `testimonials`:**
  ```sql
  alter table testimonials
    add column if not exists rating integer check (rating between 1 and 5) default 5,
    add column if not exists headline text,
    add column if not exists author_role text default 'PM Academy Learner',
    add column if not exists is_featured boolean default false;
  ```

#### 5. Security / Authorization
- Submission: Authenticated users only (`auth.uid() = user_id`).
- Moderation: Restricted strictly to authenticated Admins (`ADMIN_EMAILS` or `users.is_admin`).

#### 6. UX / UI Plan
```
Learner earns certificate or completes curriculum
→ Learner opens Testimonial modal
→ Enters 5 stars + review + headline + role + checks "Allow public feature"
→ Submits -> status = 'pending', is_published = false
→ Admin reviews in Admin Console -> clicks "Approve & Publish"
→ Status becomes 'approved', is_published = true -> Appears on homepage /#testimonials
```

#### 7. Edge Cases
- **No Reviews Published Yet:** Homepage renders curated "Sample Learner Pathways" fallback cards without fake live timestamps. No fake reviews presented as genuine.

#### 8. Testing Plan
- Test submission via `POST /api/testimonials`.
- Test admin moderation actions in `lib/__tests__/admin-console.test.ts`.

#### 9. Manual Actions Required
- **Required:** Execute migration `20260810000003_update_testimonials_schema.sql`.

---

### Area 7: Fix Certificate QR Code Verification

#### 1. Current State
- **Existing File:** `apps/web/lib/certificates.ts`.
- **Existing Function:** `generateQrCodeSvg(url: string)`.
- **Problem:** Function generates pseudo-random 21x21 matrix pixels (`seed = (seed * 31 + url.charCodeAt(i)) & 0xffffffff`), producing invalid, non-scannable SVG grids.

#### 2. Root Cause / Gap Analysis
- The QR generator function uses custom pseudo-random math rather than standard ISO/IEC 18004 QR Code byte encoding format and Reed-Solomon error correction.

#### 3. Recommended Final Implementation
- **Library Selection:** Audit existing project dependencies and prefer a mature, well-tested QR generation library (e.g. `qrcode` or `qrcode-generator`) compatible with Next.js/SSR. A custom QR encoder will only be considered if a compelling architectural dependency conflict is discovered and verified.
- **Dynamic Verification URL:** Dynamically build `verificationUrl`:
  `const verificationUrl = `${BRAND.siteUrl}/verify/${certificateCode}``
- **SVG Matrix Rendering:** Generate standard compliant QR Code SVG containing valid finder patterns, timing patterns, format info, and data blocks.
- **Verification Page (`app/verify/[certificateId]/page.tsx`):** Displays certificate details, learner name, issue date, credential ID, and renders the scannable SVG QR code.

#### 4. Data Model / Database Impact
- Reuses `certificates` table.

#### 5. Security / Authorization
- Verification page `/verify/[certificateId]` is public for credential validation.

#### 6. Testing Plan
- **Unit Test:** `npm run test:certificates` verifies SVG output structure.
- **Manual Verification:** Scan QR code with physical iOS Camera & Android Google Lens to verify instant resolution to `https://prodily.adityagangwani.me/verify/PMA-2026-XXXXXX`.

#### 7. Manual Actions Required
- `Not required.` (Verification only).

---

### Area 8: Operational Admin Console Expansion

#### 1. Current State
- **Existing Route:** `/admin` with tabs for Overview, Content, Users, Communications, Certificates, Feedback, System.
- **Existing Auth:** `getAuthenticatedAdminUser()` checks `ADMIN_EMAILS` or `users.is_admin = true`.
- **Missing Operations:** User Inspection Slide-Over Drawer; server-side User Deletion trigger (`deleteAccount`); User Progress & XP Reset trigger; Feedback / Contact Query Resolution tracking; Audit Log Inspector.
- **Explicit Scope Decisions:**
  - `Toggle Admin Role` is **REMOVED** from normal Admin Console operations. Admin privilege assignment remains a controlled infrastructure/security operation (`ADMIN_EMAILS`).
  - Certificate revocation/re-issue is marked **Optional / Post-Launch** as issued certificates are permanent legal credentials under current PRD specs.
  - Unrestricted database editing is explicitly prohibited.

#### 2. Root Cause / Gap Analysis
- Current Admin Console is primarily read-only summary cards. Missing explicit server-side operational mutation endpoints backed by audit logging.

#### 3. Recommended Final Implementation
- **Admin API Endpoints:**
  - `POST /api/admin/users/[id]/delete`: Executes hard account deletion with audit log (`admin_user_deleted`).
  - `POST /api/admin/users/[id]/reset-progress`: Resets progress with audit log.
  - `PATCH /api/admin/contact/[id]`: Updates contact message status (`replied`, `archived`).
  - `POST /api/admin/testimonials/moderate`: Executes moderation actions.
- **User Inspection Drawer (`components/admin/UserDetailDrawer.tsx`):**
  - Slide-over panel inspecting user stats, XP ledger, streak, completed lessons, certificates, public portfolio link.
  - Action buttons: **Reset Progress**, **Delete Account** (with `ConfirmDestructiveAction` typed confirmation dialog).
- **Audit Log System (`admin_audit_logs` table):**
  - Logs `admin_user_id`, `admin_email`, `action`, `target_resource`, `target_id`, `metadata`, `timestamp`.

#### 4. Data Model / Database Impact
- **New Table `admin_audit_logs`:**
  ```sql
  create table if not exists admin_audit_logs (
    id uuid primary key default gen_random_uuid(),
    admin_user_id uuid references users(id) on delete set null,
    admin_email text not null,
    action text not null,
    target_resource text not null,
    target_id text,
    metadata jsonb,
    created_at timestamptz not null default now()
  );
  ```
- **RLS:** Admin-only access.

#### 5. Security / Authorization
- Every Admin API route enforces `getAuthenticatedAdminUser()`. Returns 403 Forbidden for non-admin users.

#### 6. Testing Plan
- Unit tests for admin guard and audit logger.
- Test Admin role enforcement on all `/api/admin/*` endpoints.

#### 7. Manual Actions Required
- **Required:** Execute migration `20260810000004_create_admin_audit_logs.sql`.

---

### Area 9: Settings Reset Audit & Hardening

#### 1. Current State
- **Existing Routes:** `/api/settings/reset/progress`, `/api/settings/reset/xp`, `/api/settings/reset/streak`, `/api/settings/reset/flashcards`, `/api/settings/reset/skill-radar`.
- **Existing Implementation:** `lib/settings/settings-service.ts`.
- **Working:**
  - `resetXp()` inserts a negative `xp_events` row (`user_reset`) to preserve append-only ledger invariant, and sets `total_xp = 0, level = 1`.
  - `resetProgress()` deletes `user_lesson_progress` and `quiz_attempts`.
  - `resetFlashcards()` deletes `user_flashcard_srs`.
  - `resetStreak()` sets `current_streak = 0`.

#### 2. Root Cause / Gap Analysis
- Need to ensure Settings Reset does NOT accidentally delete certificates, badges, public portfolio settings, or reflections unless the user explicitly chooses **Delete Account**.

#### 3. Audit Findings (What is reset vs what stays):

| Data Category | Full Reset Scope | Intended Behavior |
|---|---|---|
| `user_lesson_progress` | RESET | Deleted |
| `quiz_attempts` | RESET | Deleted |
| `user_flashcard_srs` | RESET | Deleted |
| `xp_events` | PRESERVED & OFFSET | Negative `user_reset` row inserted |
| `users.total_xp` | RESET | Set to 0 |
| `users.level` | RESET | Set to 1 |
| `users.current_streak` | RESET | Set to 0 |
| `certificates` | **PRESERVED** | Retained (Issued credentials are legal records) |
| `user_badges` | **PRESERVED** | Retained |
| `reflections` | **PRESERVED** | Retained |
| `users.is_portfolio_public` | **PRESERVED** | Retained |
| `users.email` / Profile | **PRESERVED** | Retained |

#### 4. Recommended Final Implementation
- **UI Confirmation Dialogs:** Require typing `RESET` in `ConfirmDestructiveAction` modal before executing reset.
- **Client Cache Synchronization:** Call `router.refresh()` and revalidate SWR/React Query caches after reset response HTTP 200.

#### 5. Testing Plan
- Automated test `npm run test:settings` verifies negative XP calculation, progress deletion, and profile preservation.

#### 6. Manual Actions Required
- `Not required.`

---

## 4. Prioritized Implementation Roadmap

```
┌─────────────────────────────────────────────────────────────────────────┐
│ PHASE A: Database / Shared Foundation / Security                        │
│ 1. Migration 20260810000001: user_feedback & user_feedback_prompts      │
│ 2. Migration 20260810000002: contact_messages                           │
│ 3. Migration 20260810000003: testimonials schema update                 │
│ 4. Migration 20260810000004: admin_audit_logs                           │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ PHASE B: Core User-Facing Systems                                       │
│ 1. Certificate QR Generator (Mature QR library integration)             │
│ 2. Contact Us Form & Forwarding API (POST /api/contact -> Resend)       │
│ 3. Resend Inbound Receiving Pipeline Verification & Webhook Handler      │
│ 4. Contextual Feedback Prompt Engine & Server-Authoritative 1hr State   │
│ 5. Real Testimonial Submission & Admin Moderation Pipeline              │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ PHASE C: Notifications, Notification UX & Operational Admin Console     │
│ 1. Real-time Notification Client Event Bus & Floating NotificationToast │
│ 2. NotificationCenterDrawer Focus & Mobile UX Polish                    │
│ 3. Operational Admin Console (User Detail Drawer, Controlled Deletion,  │
│    Progress Reset, Testimonial Moderation, Contact Messages Inspector)  │
│ 4. Settings Reset Hardening & Typed Confirmation Modals                 │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ PHASE D: Testing, E2E Verification & Production Configuration           │
│ 1. Complete Unit & Integration Test Suites                              │
│ 2. Physical QR Code Phone Camera Verification                           │
│ 3. End-to-End Contact Inquiry & Email Routing Verification              │
│ 4. Production Build (npm run build) & Verification                      │
└─────────────────────────────────────────────────────────────────────────┘
```

### Dependency Map:
- **Parallel Work:** Phase B items (Certificate QR, Contact Form, Feedback Prompt, Testimonials) can be built concurrently once Phase A database migrations are complete.
- **Sequential Dependencies:** Phase C Admin Console operations depend on Phase A database tables (`admin_audit_logs`, `contact_messages`, `user_feedback`, `testimonials`).

---

## 5. Manual Post-Implementation Configuration Checklist

Every external manual action is explicitly classified below:

1. **Supabase Database Migrations:**  
   - **Classification:** `Required`  
   - Execute migration files in order: `20260810000001`, `20260810000002`, `20260810000003`, `20260810000004`.
2. **Cloudflare / DNS Setup (Resend Inbound Receiving):**  
   - **Classification:** `Required only if the implementation uses Resend Receiving architecture`  
   - Add verified MX record for `prodily.adityagangwani.me` in Cloudflare / DNS provider.
3. **Resend Dashboard Configuration:**  
   - **Classification:** `Required only if the implementation uses Resend Receiving architecture`  
   - Enable Inbound Email Receiving for `prodily.adityagangwani.me`, set Webhook URL to `https://prodily.adityagangwani.me/api/email/webhooks`, and set `RESEND_WEBHOOK_SECRET`.
4. **Vercel / Environment Variables:**  
   - **Classification:** `Required`  
   - Verify `NEXT_PUBLIC_SITE_URL = https://prodily.adityagangwani.me`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, and `ADMIN_EMAILS = adityagangwani@gmail.com`.
5. **Physical QR Code Phone Scan Test:**  
   - **Classification:** `Verification only`  
   - Scan issued certificate on a phone camera to verify resolution to `https://prodily.adityagangwani.me/verify/PMA-YYYY-XXXXXXXX`.

---

## 6. Definition of Done per Feature

- **Real-Time Notifications:** Completing a quiz/lesson triggers instant UI toast + updates Bell unread badge without page refresh or polling delay.
- **Notification Drawer:** Keyboard accessible (`Tab`, `Space`, `Enter`, `ESC`), date-grouped, responsive across mobile and desktop.
- **Contextual Feedback System:** Prompts trigger after Module/Capstone completion and ~1hr site usage; 1-hour usage state is server-authoritative; each prompt displays AT MOST ONCE per milestone.
- **Contact Us System:** Web contact form saves inquiries to DB, sends alert email to `pmacademyapp@gmail.com` with Reply-To set to sender, and lists inquiries in Admin Console.
- **Resend Inbound Email:** Direct emails sent to `hello@prodily.adityagangwani.me` verified against actual Resend receiving capabilities, routing to `contact_messages` DB and forwarding to `pmacademyapp@gmail.com`.
- **Testimonial Moderation:** Public reviews require explicit user opt-in and Admin approval before appearing on homepage; zero fake testimonials presented as genuine.
- **Certificate QR Code:** Renders standard compliant QR Code SVG using a mature QR library; physically scannable on real iOS/Android phone cameras.
- **Admin Operational Console:** Allows user inspection, progress resets, user deletion, and moderation with full `admin_audit_logs` tracking; toggle admin role removed; no unrestricted DB editing.
- **Settings Reset:** Resets intended learning state while preserving account identity and issued legal certificates; requires typed confirmation (`RESET`).

---

## 7. Founder Decisions Required

1. **Feedback Prompt Milestones:** Confirm prompt trigger thresholds (Module completion, Capstone submission, 1 hour active site usage).
2. **Contact Receiving Inbox:** Confirm `pmacademyapp@gmail.com` as the intended receiving inbox for contact inquiry email alerts.

---

*This revised document is saved as `Pre-Launch-Product-Remediation-Implementation-Plan.md` and registered in the workspace artifacts directory.*
