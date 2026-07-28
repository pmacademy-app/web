---
name: pm-academy-product-architect
description: >
  PM Academy product architecture and system design skill. The "think before you build"
  skill for architectural decisions, new feature design, system-level trade-offs, and
  cross-cutting concerns. Triggers on: architectural decisions, "how should we design X",
  "should we add Y to the stack", system design questions, or anything that could change
  the fundamental structure of the application.
---

# PM Academy — Product Architect

Load `00-pm-academy-core` alongside this skill.

---

## 1. The Architect's Prime Directive

**For PM Academy, the constraint set is fixed:**
- Solo-founder buildable.
- ₹0 infrastructure cost (free tiers only until Phase 7).
- Static-first, targeting ~5,000 users MVP.
- Capable of scaling later without a rewrite.

**Every architectural decision must be evaluated against this constraint set — not against "what would a team of 10 engineers build."**

---

## 2. Architectural Decisions Already Made (DO NOT REOPEN)

These are settled. Reopening them without a documented, specific reason wastes scarce time.

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Frontend framework | Next.js 16 App Router + TypeScript | SSR/SSG for SEO, single deploy, huge ecosystem |
| Styling | Tailwind CSS v4 + shadcn/ui | Fast, consistent, no custom design system build cost |
| Content delivery | Markdown → JSON, build-time | Static, no runtime parsing, CDN-served, zero cost |
| Database | Supabase PostgreSQL | User state only, free tier sufficient for MVP |
| Auth | Supabase Auth | Don't build custom auth |
| Hosting | Vercel | Free tier, native Next.js, zero DevOps |
| Search | Client-side, build-time index | No server infrastructure, free, fast enough |
| Email | Resend SMTP | Free tier 3K/month, Supabase integration |
| Analytics | Google Analytics | Free, sufficient for MVP-scale product analytics |
| Gamification | In-house (XP, SM-2, streaks) | No 3rd-party dependency, full control |
| Leaderboard scope | Cohort/friends only, never global | Avoids demotivating the majority |

---

## 3. Next.js 16 App Router Architectural Invariants

Next.js 16 introduces critical changes from previous versions. Every AI agent or developer must adhere to these framework rules:

### Async Params Invariant
In Next.js 16, route parameters (`params`) and search parameters (`searchParams`) are asynchronous objects (Promises).
- **Rule:** You MUST `await` `params` and `searchParams` in all layout files, page files, metadata generators, and route handlers.
- **Why:** Accessing property values directly (e.g., `params.slug` or `searchParams.q`) without awaiting will evaluate to `undefined` or cause compile/runtime errors.

```typescript
// ✅ CORRECT Next.js 16 Route Handler
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  // ...
}
```

---

## 4. How to Evaluate a New Architectural Proposal

For any "should we add X to the stack" question:

```
1. Does it have a free tier sufficient for pre-launch and early-launch scale?
   → If no: reject until Phase 7 monetization makes it viable.

2. Does it duplicate a capability already in the stack?
   → If yes: reject (prefer the boring, already-chosen solution).

3. If we remove it later (it stops being free / product outgrows it), does that require a rewrite of core logic?
   → If yes: reject or design so the removal is an upgrade path, not a rewrite.

4. Can a solo founder maintain it without a team?
   → If no: reject.

5. Is it covered by the documented non-goals (PRD.md §6)?
   → If yes: reject.
```

Only if ALL five pass: document in Architecture.md §1, add to AGENTS.md, update this skill.

---

## 5. The Content Pipeline — Architectural Invariants

These are the load-bearing architectural decisions for content. Touch them only with extreme care.

1. **Source Markdown files are canonical.** The source of truth lives at `/content/lessons/` (repo root). Nothing else is canonical.
2. **No content in the database.** `user_lesson_progress.lesson_slug` is a TEXT string that happens to match a JSON file's `meta.slug`. It is not a foreign key. Content can be regenerated without affecting user state.
3. **Stable IDs are a contract with the database.** Once a `quiz[].id` or `flashcard[].id` is in production JSON, it cannot change. User-state records in Supabase reference it. Changing an ID breaks user progress data. Treat it like a DB migration: backwards-incompatible.
4. **The parser must be idempotent.** Running it 100 times on the same source files produces the same 90 JSON files. No timestamps, no random UUIDs in IDs.
5. **Validation is a quality gate, not optional.** The validator in CI is what prevents broken content from reaching production.

---

## 6. The Data Model — Architectural Invariants

1. **`xp_events` is append-only.** Never DELETE. Never UPDATE. It is an audit ledger. `users.total_xp` is a computed cache — deriving it from `xp_events` should always produce the same result. Trigger-based updates are mandatory to maintain consistency.
2. **User state references content by slug (text), not by FK.** This is the seam between the static content world and the dynamic user-state world. Preserve this seam.
3. **RLS is the security layer, not the application layer.** Application code should correctly scope queries by user. But if application code has a bug, RLS is the backstop. Both must be correct.
4. **The `waitlist` table is pre-auth.** Do not add a foreign key from `waitlist` to `users`.

---

## 7. Scaling Decisions (make only when actually needed)

The static-first architecture means most traffic is CDN-served with zero server load. ~5,000 users is well within free tiers.

| Trigger | Action |
|---------|--------|
| Supabase DB size approaching 500MB or MAU approaching 50K auth users | Upgrade to Supabase Pro ($25/mo) — same instance, no migration |
| Vercel bandwidth/function invocations approaching Hobby limits | Upgrade to Vercel Pro — same deployment model |
| Content delivery scaling | Already solved — static JSON via Vercel Edge Network CDN |
| API performance | Add Supabase DB indexes on high-query columns first |
| Splitting API routes into a dedicated service | Explicitly deferred. Do not preemptively microservice a 90-lesson product. |

---

## 8. What "Don't Over-Engineer" Means Here

- **Avoid microservices.** One Next.js app, one Supabase project.
- **Avoid custom auth.** Supabase Auth handles identity.
- **Avoid server-side search.** The build-time index + client-side library is fast enough, free, and offline-capable.
- **Avoid adding a CMS.** Markdown files in the repo, edited via code editor, is the CMS.
- **Avoid real-time features** unless they solve a real problem (Supabase Realtime is available but not needed for MVP).
- **Avoid a separate CDN.** Vercel Edge Network serves the static JSON content.

---

## 9. Architecture Validation Checklist

Before approving any major architectural change:
- [ ] Evaluated against the 5-question filter in §4.
- [ ] Doesn't duplicate existing stack capability.
- [ ] Has a free tier sufficient for ≥5,000 users.
- [ ] Removal/replacement doesn't require a core logic rewrite.
- [ ] Architecture.md §1 table updated with: choice, why, free-tier ceiling, upgrade trigger.
- [ ] AGENTS.md updated if it affects how AI agents should work.
- [ ] Ripple effects checked across all 5 source-of-truth docs.
- [ ] Change documented with version bump in Architecture.md Changelog.
