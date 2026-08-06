# Sprint 8.4 — Notification UX

**Phase:** 4 (Public Launch Preparation) · **Depends on:** none new (reuses existing `NotificationBell`/`NotificationCenterDrawer` primitives from Sprint 6.3, unchanged by anything in Phase 3.7). · **Blocks:** Sprint 8.5 (Mobile Experience needs the panel's mobile behavior finalized before the mobile pass).
**Companion docs:** `Architecture-Review-Report.md §3.1` (owns this sprint's design decision), `Notification-Architecture.md §6` (existing in-app notification data layer this sprint re-surfaces, doesn't rebuild).

---

## Goal

Replace the dedicated Notifications page with a right-side notification panel (Linear/GitHub/Slack pattern), per the brief's explicit request, using existing components rather than a new notification system.

## Deliverables

1. `NotificationPanel` component — a persistent slide-over triggered by the existing `NotificationBell`, replacing the current drawer-that-navigates-to-a-page pattern (if the current implementation navigates) or formalizing the drawer as the sole interaction model (if Sprint 6.3's `NotificationCenterDrawer` already behaves this way — verify actual current behavior before assuming which case applies, since `CURRENT_STATUS.md` lists both `NotificationBell` and `NotificationCenterDrawer` as already shipped).
2. Dedicated Notifications page route removed, with a redirect (to the equivalent panel-open state, or to Dashboard) for any bookmarked/linked URLs.
3. Panel content parity check: mark-all-read, preferences deep-link (to Settings → Notifications, Sprint 7.2), read/unread state, notification grouping/categorization — everything the previous page supported.

## UI Changes

- This sprint is entirely UI — the notification *data layer* (queue, preferences, event registry) is untouched, per `Architecture-Review-Report.md §3`'s explicit call not to rebuild what's already correct.
- Panel opens over the current screen (not a route navigation) — preserves scroll position and context on whatever screen the user was on when they opened it.

## Backend Changes

None. This sprint consumes the existing `/api/notifications/*` routes (Sprint 6.3) unchanged.

## Database Changes

None.

## API Impact

None — no new endpoints, no contract changes. Existing notification read/mark-read endpoints are reused as-is.

## Testing Checklist

- [ ] Panel opens from `NotificationBell` on every authenticated screen, not just Dashboard.
- [ ] All notification functionality previously on the dedicated page (mark-all-read, preferences link, categorization/grouping) is present in the panel — verified via a direct before/after capability checklist.
- [ ] Old Notifications page route redirects correctly (no dead 404 left for any bookmarked link).
- [ ] Panel state (open/closed) doesn't interfere with the underlying screen's own state (e.g., opening the panel while mid-flashcard-review doesn't lose review progress).
- [ ] Panel is keyboard-accessible (open/close, navigate list) — consistent with the WCAG AA verification standard this whole phase holds itself to (`Sprint 7.5`).

## Definition of Done

- All previously page-based notification functionality is available from the panel.
- No dead route.
- Panel meets the same accessibility bar verified in Sprint 7.5 for other new-in-this-phase UI.

## Out of Scope

- Any change to notification content, categorization logic, or delivery timing — purely a presentation-layer change to *where* in-app notifications are viewed, not *what* is sent or *when*.
- Mobile-specific panel behavior (full-screen takeover vs. slide-over on small viewports) — decided and verified in Sprint 8.5, this sprint ships the desktop-primary behavior and flags the mobile decision explicitly rather than guessing at it here.

## Risks

- **Assuming the wrong "before" state.** `CURRENT_STATUS.md` shows `NotificationCenterDrawer` already shipped in Sprint 6.3, which may mean much of this sprint's nominal scope is already done and this sprint is really just "remove the redundant dedicated page, if one still exists alongside the drawer." First action in this sprint should be auditing actual current behavior against this spec's assumptions, not assuming a full rebuild is needed.

## Future Extensions

- Real-time push (WebSocket/SSE) updates to the panel without a manual refresh, if usage data post-launch shows staleness is a real user complaint — not assumed necessary now.
