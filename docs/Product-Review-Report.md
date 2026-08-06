# Prodigy PM Academy — Product Review & Simplification Report

**Role:** Chief Product Architect / UX Architect review, ahead of Phase 3.7–Phase 5.
**Test applied to every item below:** does this duplicate another feature, increase maintenance, complicate the UX, or create technical debt that a simpler approach avoids? If yes, simplify or cut; if no, leave it and document why more clearly instead.

---

## 1. Simplifications recommended and adopted

### 1.1 Collapse "Notifications" and "Emails" into one Admin concept
**Why:** they're the same event-driven system (`Notification-Architecture.md`) wearing two nav labels. Two top-level Admin views for one subsystem means two places to look for the same queue-health data, and doubles the surface area an admin has to learn.
**Benefit:** one mental model — "Communications" — for anything that leaves the system as a message. **Trade-off:** none meaningful; this was accidental sprawl, not a deliberate separation. **Future expansion:** if push/SMS/WhatsApp channels are added (already anticipated in `Notification-Architecture.md §1`), they're new tabs inside Communications, not new top-level Admin sections.

### 1.2 Mermaid: runtime → build-time static assets
Covered in depth in `Architecture-Review-Report.md §6`. Product-level benefit: one less thing that can visibly break for a learner mid-lesson (a Mermaid runtime error is exactly the kind of "distraction from the core learning loop" Product Principle #1 warns against).

### 1.3 Danger Zone actions live under Settings, not their own Admin-adjacent flow
Some products build a separate "Account Management" surface for destructive actions. Rejected here — six reset actions plus delete don't need their own IA; they're a `Settings §5` subsection with strong confirmation UX (`Architecture-Review-Report.md §4`). **Benefit:** one Settings mental model, not two. **Trade-off:** none — this is genuinely simpler with no lost capability.

### 1.4 Feedback triggers reuse the existing notification event system
Rather than building a separate "feedback prompt" scheduling mechanism, `feedback.requested` becomes one more event type in the existing registry (`Notification-Architecture.md §3.2`), fired after 3 lessons / module completion / certificate completion. **Benefit:** feedback prompts inherit rate-limiting, preferences, and delivery tracking for free — no new infrastructure. **Trade-off:** none.

### 1.5 Certificate versioning via one additive column, not a parallel certificates-v2 table
A tempting-but-wrong pattern when redesigning a "v2" of something is to stand up a parallel table and migrate. Rejected here: `template_version` as an additive column on the existing `certificates` table is simpler, preserves all existing verification links, and avoids a data migration on a table that's part of the frozen-adjacent core schema.

---

## 2. Features reviewed and kept as-is (with clearer documentation, not redesign)

| Feature | Verdict | Why |
|---|---|---|
| Skill Radar scoring formula | **Keep exactly as specified** | Locked in Sprint 3, already the product's stated core differentiator (`PRD.md §4.8`). No redesign signal in the brief or in the docs suggests this needs to change — re-documenting it clearly in the rewritten `PRD.md` is sufficient. |
| XP ledger / anti-gaming model | **Keep** | Correctness-critical, already correctly designed (append-only, server-verified engagement). Touching this for a "documentation and architecture" pass would be scope creep beyond what's asked. |
| Leaderboard (cohort-only, consistency-ranked, opt-in) | **Keep** | This is a deliberate, well-reasoned anti-pattern stance (`PRD.md §4.10`, `§7`) — a global leaderboard would be the kind of feature this report's own test would flag as *adding* complexity (moderation, gaming risk) without clear benefit. No change recommended. |
| Badges (~20 cap) | **Keep the cap** | The existing rule — badges must map to real milestones, never filler — is exactly the discipline this report is asking every other feature to have. Nothing to simplify; hold the line as new sprints add features (e.g., don't add a "used Settings 2.0" badge). |

---

## 3. New features assessed against the "should we build this" test

### 3.1 Feedback moderation queue (new, Sprint 8.3-adjacent)
- Duplicates another feature? No — nothing currently collects or surfaces testimonials.
- Increases maintenance? Modest — one more Admin view, reuses existing table/moderation patterns (`AdminDataTable`).
- Complicates UX? No — it's an admin-only surface; learner-facing UX is just the existing feedback prompt.
- **Verdict: build**, scoped small (approve/edit/publish, no threaded discussion, no automated sentiment scoring at launch — that's a real future-expansion candidate, not a v1 requirement).

### 3.2 Marketing Controls in Admin (new)
- Needed specifically because Feedback moderation has nowhere to publish *to* without it, and because the brief asks for admin control over marketing content (testimonials, feature toggles for the launch site).
- **Verdict: build**, kept deliberately small — copy/testimonial/toggle management only, not a general CMS. See `Architecture-Review-Report.md §2`'s note that "future CMS capabilities" are acknowledged but explicitly not built now (no current requirement justifies the complexity of a real CMS for a single-page-per-section marketing site).

### 3.3 Right-side Notification Panel (redesign of existing page)
- Already assessed in `Architecture-Review-Report.md §3` as low-risk, component-reuse change. Product benefit: matches the pattern users already know from Linear/GitHub/Slack, removes a full page navigation for something that's inherently a transient, dismissible concern — not a destination.

---

## 4. Explicitly rejected / deferred (not in scope for this phase)

| Idea | Status | Why |
|---|---|---|
| AI Mentor / AI-generated feedback on capstones | **Stays cut** | Already resolved in `PRD.md §11` as cut from v1 with a clear, still-valid rationale (breaks ₹0-infra principle, no free tier for LLM calls at volume). Nothing in this brief provides new justification to reopen it — reopening a settled decision requires a real reason per `Rules.md §6.4`, not just brief-writing momentum. |
| General-purpose Admin CMS | **Deferred** | Acknowledged as a "future capability" in the Admin IA (§2 above) but not built now — no current content-authoring workflow needs it beyond what Marketing Controls covers. |
| Automated testimonial sentiment scoring | **Deferred** | Would require an ML/LLM dependency for a problem (dozens of testimonials, not thousands) that manual moderation solves fine at this scale. Revisit only if testimonial volume genuinely becomes a bottleneck. |
| Push/SMS/WhatsApp notification channels | **Deferred, already anticipated** | `Notification-Architecture.md` is explicitly designed so these are additive later — no reason to build them now for a launch that doesn't need them. |

---

## 5. Net effect on scope

This review **removes** one duplicated Admin concept (Notifications+Emails → Communications), **removes** a runtime dependency (Mermaid), and **avoids** three plausible-but-unjustified additions (general CMS, sentiment scoring, extra notification channels) — while adding only what's structurally necessary for the brief's stated goals (Feedback moderation, Marketing Controls, Certificate versioning, Settings Danger Zone). The result is a smaller total surface area than a literal, unfiltered implementation of the brief would have produced.

---

## Changelog

- v1.0 (2026-08-06) — Initial product review ahead of Phase 3.7 sprint planning.
