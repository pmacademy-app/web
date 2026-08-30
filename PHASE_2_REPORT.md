# Phase 2 Implementation Report: Client Polling & Duplicate Request Reduction

## 1. Executive Summary

Phase 2 of the Prodily performance optimization plan has been completed. This phase targeted client-side polling loops, redundant request cascades, and duplicate fallback queries that previously drove high Vercel Serverless Function invocations and Fluid Active CPU usage during active learner sessions.

All optimizations have been applied directly to the codebase on the dedicated implementation branch `fixes/implementation-plan`, validated with the complete automated test suite (903/903 tests passing across 85 test suites), typechecked with zero TypeScript errors, linted with zero ESLint warnings/errors, and verified via a complete Next.js Turbopack production build.

---

## 2. Exact Files Modified & Created

### Modified Files:
1. **`apps/web/app/api/feedback/eligibility/route.ts`**
   - Enhanced `POST` endpoint to calculate and return `{ success: true, activeSeconds, eligiblePrompts, completedPrompts }` directly, eliminating the need for a secondary `GET` request.
2. **`apps/web/hooks/useUsageTimeTracker.ts`**
   - Increased dwell sync interval from 30s to 60s.
   - Collapsed the dual-request cycle (`POST` followed immediately by `GET`) into a single `POST` sync.
   - Added in-flight request guard (`isSyncingRef`) preventing overlapping concurrent network calls.
   - Added milestone completion detection (`isUsage1hrDoneRef`), permanently stopping periodic interval polling once the milestone is satisfied.
   - Added tab visibility guard (`document.hidden`).
   - Ensured clean unmount timer teardown.
3. **`apps/web/app/api/notifications/route.ts`**
   - Added support for batch mark-read (`notificationIds: string[]`) in the `PATCH` handler.
   - Enforced strict user scoping (`eq('user_id', authUser.id)`) to prevent cross-user mutations.
   - Preserved backward compatibility for single `notificationId` updates and `mark_all_read`.
4. **`apps/web/components/notifications/NotificationBell.tsx`**
   - Added in-flight deduplication guard (`isFetchingRef`).
   - Added tab visibility awareness (`document.hidden` check + `visibilitychange` listener) to pause background polling when the tab is inactive.
   - Added drawer-open pause logic to prevent polling when the drawer is open and managing its own state.
5. **`apps/web/components/notifications/NotificationCenterDrawer.tsx`**
   - Automatically marks currently displayed unread notifications as read when the drawer is opened.
   - Dispatches batch `PATCH /api/notifications` with only the displayed unread item IDs.
   - Updates local UI state and unread badge count optimistically.
   - Added non-fatal error handling to ensure drawer usability even on network dropouts.
6. **`apps/web/components/marketing/sections/testimonials.tsx`**
   - Updated client fetch condition from `initialTestimonials && initialTestimonials.length > 0` to `initialTestimonials !== undefined`.
   - Prevents redundant client-side fallback `fetch('/api/testimonials')` on homepage visits when zero published testimonials exist.
   - Fully preserves the zero-review empty state with the "Write First Review" CTA.

### Created Files:
1. **`apps/web/lib/__tests__/phase2-polling-deduplication.test.ts`**
   - Comprehensive test suite covering feedback dwell collapsing, notification batch mark-read scoping, and testimonials server-data deduplication.

---

## 3. Detailed Area-by-Area Breakdown

### Area 1 & 2: Feedback Dwell-Time Tracking & Request Collapsing
- **Previous Behavior**:
  - Polling interval: 30 seconds.
  - Every 30s cycle sent `POST /api/feedback/eligibility` (which returned `{ success: true }`), immediately followed by `GET /api/feedback/eligibility` to check milestone eligibility.
  - Generated **4 requests/minute per active tab** indefinitely, even after the 1-hour milestone was completed.
- **Optimized Behavior**:
  - Polling interval: 60 seconds (50% reduction in interval frequency).
  - Single `POST /api/feedback/eligibility` returns `{ success: true, activeSeconds, eligiblePrompts, completedPrompts }` directly (0 follow-up `GET` calls).
  - In-flight lock (`isSyncingRef`) prevents stacking requests on slow network connections.
  - Tab visibility check (`document.hidden`) pauses accumulation when the user switches tabs.
  - Once `usage_1hr` milestone is reached or already completed, polling is permanently stopped for the session.
- **Invocation Reduction**: $\approx 75\%\text{--}100\%$ reduction in feedback dwell requests per learner session.

---

### Area 3 & 4: Notification Polling & Drawer Mark-Read
- **Previous Behavior**:
  - Bell polled `/api/notifications?limit=1` every 60s continuously, regardless of tab visibility or drawer state.
  - Opening the drawer fetched `/api/notifications` but did not mark items as read, requiring manual individual clicks.
- **Optimized Behavior**:
  - `NotificationBell` skips interval execution when `document.hidden` is true or when `drawerOpen` is active.
  - Tab refocus (`visibilitychange`) triggers a check only if $\ge 60\text{s}$ has elapsed since the last fetch.
  - Opening `NotificationCenterDrawer` loads notifications and immediately issues a single batch `PATCH /api/notifications` with `notificationIds: string[]` for unread displayed items.
  - Unread count is optimistically cleared in the UI and synchronized with the parent bell.
  - Cross-user security is strictly enforced via `user_id = authUser.id`.
- **User Experience**: WhatsApp-style smooth auto-read on drawer open without requiring manual item clicks.

---

### Area 5: Testimonials Fallback Deduplication
- **Previous Behavior**:
  - `TestimonialsSection` checked `if (initialTestimonials && initialTestimonials.length > 0) return`.
  - When the server found 0 published testimonials (`initialTestimonials = []`), this condition evaluated to false, triggering an immediate client-side `fetch('/api/testimonials')` on every homepage visit.
- **Optimized Behavior**:
  - Condition updated to `if (initialTestimonials !== undefined) return`.
  - Empty array `[]` from the server is recognized as authoritative initial data, skipping the client fetch completely.
  - Zero-review state with "Write First Review" CTA remains fully intact and functional.

---

## 4. Verification Suite Results

### A. TypeScript Typecheck
- **Command**: `npm run typecheck` (`tsc --noEmit`)
- **Result**: `Passed with 0 errors`

### B. ESLint Static Analysis
- **Command**: `npm run lint` (`eslint`)
- **Result**: `Passed with 0 errors and 0 warnings`

### C. Vitest Automated Test Suite
- **Command**: `npm test` (`vitest run`)
- **Result**: `85 passed test files (100%), 903 passed unit & integration tests (100%)`
- **New Tests Added**: `apps/web/lib/__tests__/phase2-polling-deduplication.test.ts` (5 tests verifying feedback collapsing, notification batch read scoping, and backward compatibility).

### D. Next.js Production Build
- **Command**: `npm run build` (`npm run content:build && next build`)
- **Result**: `Build successful (219 static/SSG/dynamic routes emitted without errors)`
- **ISR Retention**: `/curriculum` and `/lessons/[slug]` remain static ISR (`1h 1y`) as established in Phase 1.

---

## 5. Quantitative Impact Assessment (Estimated Frequency Reductions)

> **Important Distinction:** The percentages below represent **estimated client request and serverless invocation-frequency reductions** based on code analysis and architecture changes, NOT measured Vercel Fluid Active CPU reductions.
> 
> *Actual Vercel invocation and Fluid Active CPU impact requires production measurement after deployment.*

| Surface / Request Stream | Baseline Frequency | Optimized Frequency | Estimated Request Reduction |
| :--- | :--- | :--- | :--- |
| Feedback Dwell + Check | 4 req / min (30s POST + GET) | 1 req / min (60s POST only, 0 after 1hr) | **75% – 100%** |
| Background Tab Feedback Polling | 4 req / min when tab hidden | 0 req / min (paused when hidden) | **100%** |
| Background Tab Notification Polling | 1 req / min when tab hidden | 0 req / min (paused when hidden) | **100%** |
| Testimonials Homepage Fallback | 1 req / homepage view (at 0 reviews) | 0 req / homepage view | **100%** |
| Notification Drawer Read Actions | N manual requests per item | 1 batched request on drawer open | **$\sim (N-1)$ reqs** |

---

## 6. Final Verification Pass

During the final verification pass, the following critical architecture paths were verified:

1. **Notification Request Sequence**:
   - Trace on opening drawer:
     ```text
     User opens drawer
             ↓
     Drawer loads displayed notifications (GET /api/notifications)
             ↓
     Unread displayed IDs identified
             ↓
     One batch mark-read request (PATCH /api/notifications { action: 'mark_read', notificationIds: [...] })
             ↓
     Local state and parent bell count updated via callback (onUnreadCountChange(0))
             ↓
     No unnecessary immediate Bell refetch or duplicate query cascade
     ```
   - Bell uses `drawerOpenRef` so that opening/closing the drawer does not re-trigger Bell polling or duplicate fetches.
2. **Displayed-Only Mark-Read Scoping & Authorization**:
   - Only notifications loaded and displayed in the drawer are marked as read.
   - Already-read notifications are filtered out before sending.
   - Non-displayed notifications and notifications on other pages remain unread in the database.
   - Database mutations in `PATCH /api/notifications` strictly enforce `.eq('user_id', authUser.id)`, preventing cross-user notification updates.
3. **Unread Count Synchronization & Graceful Error Handling**:
   - Badge count zeroed/updated optimistically without tearing down server state on network errors.
   - Individual item mark-read (`notificationId`) and `mark_all_read` actions are preserved.
4. **Production Measurement Status**:
   - All improvements are local to the codebase on `fixes/implementation-plan`. Full telemetry and CPU verification will be performed upon post-deployment staging.

---

## 7. Git Status & Commit Verification

- **Branch**: `fixes/implementation-plan`
- **Push Policy**: Strict local commit only. **No remote push performed.**

