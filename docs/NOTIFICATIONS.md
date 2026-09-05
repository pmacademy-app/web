# Notification Platform Specification — Prodily PM Academy

**Repository:** `prodily-monorepo` (app code at `apps/web/`)
**Framework:** Next.js 16.2.12 / React 19 / PostgreSQL  
**Last Updated:** September 6, 2026  

---

## 1. Overview & Architecture

The Notification Platform provides multi-channel notifications across an in-app Notification Center, system banner announcements, and targeted in-app broadcasts. There is no standalone `/notifications` page — `app/(app)/notifications/page.tsx` is a redirect stub to `/dashboard`; the actual UI is the header bell/drawer.

- **In-App Notification Store:** Persisted in `public.in_app_notifications`.
- **Learner Channel Preferences:** Configured in `public.user_notification_preferences`.
- **Delivery Audit Log:** Outbound delivery attempts are recorded across `public.email_delivery_events` / `public.notification_events`.
- **Idempotency Keys:** Notification dispatches enforce deduplication keys to guarantee at-most-once delivery.

---

## 2. Notification Center UX (Mobile vs. Desktop)

The Notification Center is embedded in the global navigation bar via `components/notifications/NotificationBell.tsx` and `NotificationCenterDrawer.tsx`.

### Viewport Positioning Specifications
- **Desktop Viewports (≥640px):** Anchored as a dropdown beneath the bell icon (`sm:absolute sm:top-full sm:right-0 sm:mt-2.5 sm:w-96`).
- **Mobile Viewports (<640px):** Rendered as a **viewport-bounded fixed panel**:
  - `position: fixed`
  - `left: 16px`, `right: 16px`
  - `max-width: calc(100vw - 32px)`
  - `max-height: 80vh`
  - Prevents horizontal clipping on small devices (360px–414px) and eliminates window scroll bugs.

### User Interaction Rules
- Click-outside and Escape-key dismissal.
- Items are grouped by date bucket (Today / Yesterday / This Week / Earlier) — there are **no** filter tabs (All/Unread/System) in the current UI.
- Real-time unread counter badge.
- **Auto-mark-as-read on open:** the drawer optimistically marks everything as read the moment it's opened, rather than exposing a manual "Mark all as read" button. (The backend does support a `mark_all_read` PATCH action at `/api/notifications`, but it isn't wired to a visible control.)

---

## 3. In-App Broadcast Campaign Engine (`/admin/notifications`)

Admins can broadcast in-app messages to segmented audiences:

- **Audience Targeting:** the API contract's audience enum is `all | individual | cohort | filtered` (`app/api/admin/notifications/in-app/route.ts`) — `individual` targets one specific user, `filtered` is the generic segment mechanism (there's no separate built-in "Inactive Learners (7 days)" preset).
- **Recipient Preview:** `/api/admin/notifications/in-app/recipient-count` and `/recipient-sample` provide exact audience size and sample profiles.
- **Broadcast Lifecycle:**
  - `POST /api/admin/notifications/in-app`: Create broadcast.
  - `POST /api/admin/notifications/in-app/[id]/execute`: Trigger immediate batch insertion into `public.in_app_notifications`.
  - `POST /api/admin/notifications/in-app/[id]/pause` and `/resume`: Pause and resume campaigns.
  - `POST /api/admin/notifications/in-app/[id]/cancel`: Cancel campaigns.

Note: `/admin/announcements` is now a redirect into the unified Communications hub (`?tab=announcements`), not an independent page — see [`docs/admin/communications.md`](admin/communications.md).

---

## 4. System Banner Announcements (`public.system_announcements`)

Platform-wide dismissable banner announcements displayed at the top of the application:
- Configurable severity (`info`, `warning`, `critical`).
- Dismissable per user with local storage and database tracking (`/api/announcements/[id]/dismiss`).
- Active announcement resolution via `GET /api/announcements/active`.

---

## 5. Status Matrix

| Component / Feature | Location | Status |
|---|---|---|
| **Notification Bell UI** | `components/notifications/NotificationBell.tsx` | 🟢 Verified in Production |
| **Mobile Viewport Panel** | `components/notifications/NotificationCenterDrawer.tsx` | 🟢 Verified in Production |
| **In-App Unread Counter** | `app/api/notifications/route.ts` | 🟢 Verified in Production |
| **In-App Broadcast Engine** | `app/api/admin/notifications/in-app/route.ts` | 🟢 Verified in Production |
| **System Banner Announcements** | `components/announcements/SystemAnnouncementBanner.tsx` | 🟢 Verified in Production |
| **Delivery Event Logging** | `lib/notifications/queue/processor.ts` | 🟢 Verified in Production |
| **Notification Idempotency** | Database unique constraint & service layer | 🟢 Verified in Production |
