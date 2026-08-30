# Notification Platform Specification — Prodily PM Academy

**Repository:** `pmacademy-app/web`  
**Framework:** Next.js 16.2.12 / React 19 / PostgreSQL  
**Last Updated:** August 30, 2026  

---

## 1. Overview & Architecture

The Notification Platform provides multi-channel notifications across an in-app Notification Center, system banner announcements, and targeted in-app broadcasts.

- **In-App Notification Store:** Persisted in `public.notifications`.
- **Learner Channel Preferences:** Configured in `public.notification_preferences`.
- **Delivery Audit Log:** Outbound delivery attempts are recorded in `public.notification_delivery_events`.
- **Idempotency Keys:** Notification dispatches enforce deduplication keys to guarantee at-most-once delivery.

---

## 2. Notification Center UX (Mobile vs. Desktop)

The Notification Center is embedded in the global navigation bar via `components/notifications/NotificationBell.tsx` and `NotificationCenterPopover.tsx`.

### Viewport Positioning Specifications
- **Desktop Viewports (≥640px):** Anchored as a dropdown popover directly beneath the bell icon (`right-0 top-12`).
- **Mobile Viewports (<640px):** Rendered as a **viewport-bounded fixed panel**:
  - `position: fixed`
  - `left: 16px`, `right: 16px`
  - `max-width: calc(100vw - 32px)`
  - `max-height: 80vh`
  - Prevents horizontal clipping on small devices (360px–414px) and eliminates window scroll bugs.

### User Interaction Rules
- Click-outside and Escape-key dismissal.
- Filter tabs: **All**, **Unread**, **System**.
- Real-time unread counter badge.
- Instant actions: **Mark all as read** and direct link navigation.

---

## 3. In-App Broadcast Campaign Engine (`/admin/notifications`)

Admins can broadcast in-app messages to segmented audiences:

- **Audience Targeting:** Target All Users, Inactive Learners, or Specific Cohorts.
- **Recipient Preview:** `/api/admin/notifications/in-app/recipient-count` and `/recipient-sample` provide exact audience size and sample profiles.
- **Broadcast Lifecycle:**
  - `POST /api/admin/notifications/in-app`: Create broadcast.
  - `POST /api/admin/notifications/in-app/[id]/execute`: Trigger immediate batch insertion into `public.notifications`.
  - `POST /api/admin/notifications/in-app/[id]/pause` and `/resume`: Pause and resume campaigns.
  - `POST /api/admin/notifications/in-app/[id]/cancel`: Cancel campaigns.

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
| **Mobile Viewport Panel** | `components/notifications/NotificationCenterPopover.tsx` | 🟢 Verified in Production |
| **In-App Unread Counter** | `app/api/notifications/route.ts` | 🟢 Verified in Production |
| **In-App Broadcast Engine** | `app/api/admin/notifications/in-app/route.ts` | 🟢 Verified in Production |
| **System Banner Announcements** | `components/announcements/SystemAnnouncementBanner.tsx` | 🟢 Verified in Production |
| **Delivery Event Logging** | `lib/notifications/queue/processor.ts` | 🟢 Verified in Production |
| **Notification Idempotency** | Database unique constraint & service layer | 🟢 Verified in Production |
