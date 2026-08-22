# Notification Platform Specification — Prodily PM Academy

**Repository:** `pmacademy-app/web`  
**Current Baseline HEAD:** `21cc985`  
**Last Updated:** August 23, 2026  

---

## 1. Overview & Architecture

The Notification Platform provides multi-channel notifications across in-app Notification Center and email delivery.

- **In-App Notifications**: Stored in `public.notifications` table.
- **In-App Notification Preferences**: Configured per user in `public.notification_preferences`.
- **Delivery Event Log**: Every delivery attempt is logged in `public.notification_delivery_events`.
- **Idempotency**: Notification events enforce unique deduplication keys to prevent duplicate notifications (`20260823000001_notification_idempotency_and_avatar_cleanup.sql`).

---

## 2. Notification Center UX (Mobile vs. Desktop)

The Notification Center is rendered in the global navbar (`components/notifications/NotificationBell.tsx` and `NotificationCenterPopover.tsx`).

### Layout Positioning Rules
- **Desktop (≥640px)**: Rendered as a right-anchored popover positioned directly under the notification bell (`right-0 top-12`).
- **Mobile (<640px)**: Rendered as a **viewport-bounded fixed panel**:
  - `position: fixed`
  - `left: 16px`, `right: 16px`
  - `max-width: calc(100vw - 32px)`
  - `max-height: 80vh`
  - High `z-index` to remain above the application shell.
  - Prevents left/right clipping on small mobile screens (360px, 390px, 414px) and eliminates horizontal page scrolling.

### User Interaction Rules
- Click-outside dismissal via `useOnClickOutside` hook.
- Escape key listener for keyboard accessibility.
- Filter tabs: All, Unread, System.
- Actions: Mark all as read, refresh, item click navigation.

---

## 3. Delivery Event Tracking Schema

`public.notification_delivery_events` logs all outbound notification attempts:

```sql
CREATE TABLE public.notification_delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid REFERENCES public.notifications(id),
  queue_id uuid REFERENCES public.email_queue(id),
  channel text NOT NULL,
  provider text NOT NULL,
  status text NOT NULL,
  resend_id text,
  error_message text,
  created_at timestamptz DEFAULT now()
);
```

---

## 4. Status Matrix

| Component / Feature | Location | Status |
|---|---|---|
| **Notification Bell UI** | `components/notifications/NotificationBell.tsx` | 🟢 Verified in Production |
| **Mobile Viewport Positioning** | `components/notifications/NotificationCenterPopover.tsx` | 🟢 Verified in Production |
| **In-App Unread Counter** | `app/api/notifications/route.ts` | 🟢 Verified in Production |
| **Delivery Event Logging** | `lib/notifications/queue/processor.ts` | 🟢 Verified in Production |
| **Admin Broadcast Dispatch** | `app/api/admin/notifications/route.ts` | 🟢 Verified in Production |
| **Notification Idempotency** | Migration `20260823000001_*.sql` | 🟢 Verified in Production |
