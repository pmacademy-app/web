# Prodigy PM Academy — Notification & Communication Architecture — Phase 3.7+ Addendum

**Status:** This is an **addendum**, not a replacement. The base `Notification-Architecture.md` (event registry, priority-tiered queue, exponential-backoff retry, timezone-aware scheduler, per-user preferences, versioned templates) is architecturally sound and is being **extended, not rebuilt** — see `Architecture-Review-Report.md §3` for the explicit reasoning against redesigning the queue/retry model. This document appends what changes for Phase 3.7–Phase 5; read it alongside the base document, which remains authoritative for everything not listed here.

---

## 1. New Event Types (extend the existing event registry, §3.2 of the base document)

| Event | Trigger | Priority tier | Introduced |
|---|---|---|---|
| `feedback.requested` | After 3 lessons completed / module completion / certificate completion | Low (non-urgent, batchable) | Sprint 7.4 |
| `certificate.shared` | User uses the "Add to LinkedIn Profile" or share-link action (`Sprint 7.3`) | Low (confirmation only) | Sprint 7.3 |
| `settings.reset_requested` | Any of the six Settings 2.0 reset actions or Delete Account completes (`Sprint 7.2`) | High (security/account-integrity relevant — user should always know a destructive action on their account completed) | Sprint 7.2 |
| `account.deleted` | Delete Account flow completes | Highest — this event's job is to **drop**, not deliver, any notification already queued for the user, per `Architecture-Review-Report.md §2.4`'s account-deletion cascade requirement | Sprint 7.2 |

These follow the existing event-registry contract exactly (payload shape, template versioning, preference-channel mapping) — no new delivery mechanism, just new entries.

## 2. Admin Surface Change (not an architecture change)

The base document's Admin Console section (§20) described "Notifications" and "Emails" as separate top-level Admin views. **As of Sprint 7.4, these are merged into one Admin section, "Communications"**, with three tabs: Templates, Queue & Health, Broadcasts. This is a navigation/IA change only — the underlying event registry, queue, and delivery mechanisms are unchanged. See `Architecture-Review-Report.md §2` for the full Admin IA and the reasoning for the merge (`Product-Review-Report.md §1.1`).

## 3. In-App UX Change: Notification Panel Replaces the Dedicated Page (Sprint 8.4)

The base document's in-app notification delivery mechanism (§6 — `NotificationBell`, `NotificationCenterDrawer`, read/unread state) is **unchanged**. What changes: the dedicated Notifications page route is removed, and the drawer becomes a persistent right-side slide-over reachable from any authenticated screen, matching the Linear/GitHub/Slack pattern requested for this phase. This is a presentation-layer change only — no data-layer or API change. Full spec: `Roadmap.md` Sprint 8.4; visual spec: `Design.md §8`.

**Note on scope discovery:** at the time `Sprint 8.4` was planned, it was unclear whether `NotificationCenterDrawer` (shipped Sprint 6.3) already behaved as a persistent panel or navigated to a full page. That sprint's first step is auditing actual current behavior before assuming a rebuild is needed — flagged explicitly in that sprint's Risks section rather than assumed here.

## 4. Preference Model — No Change, Now Has a Dedicated UI

The per-user preference model (base document §11) is unchanged. **Settings 2.0's Notifications tab (Sprint 7.2)** is the first dedicated, discoverable UI for it — previously, preferences existed in the data model without an equally coherent settings surface. This addendum exists to confirm: no new preference dimensions were added, this is a UI-surfacing project only.

## 5. Weekly Recap, Auth Emails, Security Emails, Milestone Emails, Admin Broadcasts

Unchanged — all already correctly specified in the base document (§5–§6). Confirmed in scope for `Sprint 7.2` (delivery) with no architectural change required.

## 6. Email Visual Template

Templates now source brand assets from `lib/brand.ts`/the static logo asset (`Brand-Architecture.md §4.1`, `Design.md §7`) instead of hardcoded values, per the Sprint 7.1 rebrand pass. No change to send logic, only to the static content of the template.

---

## Changelog

- v1.0 (addendum) — Phase 3.7+ additions to the base `Notification-Architecture.md`: four new event types (§1), Admin Communications merge (§2), Notification Panel UX change (§3), Settings 2.0 preference UI (§4), brand-asset sourcing in email templates (§6). Base document's queue/retry/scheduler architecture explicitly reaffirmed unchanged.
