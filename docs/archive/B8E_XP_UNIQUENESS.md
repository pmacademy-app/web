# B8-E — XP Event Uniqueness

**Batch:** B8-E (Phase 1) · **Finding:** `F-COR-3` · **Risk:** HIGH — destructive
**Status:** ⏸️ **AUTHORED, NOT APPLIED — BLOCKED ON HUMAN GATES**
**Date:** 2026-09-13

> ## ⚠️ SUPERSEDED IN PART — read [`B8E_PRE_APPROVAL_INVESTIGATION.md`](../PENDING_B8E_MIGRATION.md) first
>
> The investigation that this document asked for (§2, "filed for a human decision") was
> carried out and **found the migration described below to be unsafe**. Of the 50 rows it
> proposed to delete, only 31 are duplicates; the other 19 are legitimate earnings, and
> the blanket UNIQUE constraint would have broken three working features.
>
> The migration has since been corrected and scoped. **The scope quoted throughout this
> document — 50 rows / 510 XP — is no longer what it does.** The current scope is
> **31 rows / 310 XP / 13 users, all `theory_read`.**
>
> This file is retained for the reasoning that still holds: the trigger/`total_xp`
> finding in §4, the deploy-ordering analysis in §5, and the gate structure in §7.

---

## 1. Status in one line

The migration is written and reviewable. **It has not been run anywhere**, and the
application-side half is deliberately not shipped yet. Two gates stand in front of it,
both required by the roadmap, neither of which an agent can satisfy.

---

## 2. Gate 1 — the measured scope (SATISFIED)

B8-D ran read-only against production on 2026-09-13. Full output:
[`B8D_XP_DUPLICATES_REPORT.txt`](B8D_XP_DUPLICATES_REPORT.txt).

| | |
|---|---|
| Rows scanned | 1,636 |
| Rows with NULL `source_id` | 0 |
| Duplicate groups | 46 |
| **Excess rows to delete** | **50** |
| **XP at stake** | **510** |
| Users affected | 16 |

The scope is small. That is the argument for proceeding, not a reason to skip the gate.

### Two distinct causes are visible in the data, and only one is a race

- **`theory_read/*` duplicates land 0.03–0.9 s apart.** That is the check-then-insert
  race `F-COR-3` describes. The constraint fixes it.
- **`quiz_correct/*` duplicates land days or weeks apart** — one pair 24 days apart.
  A race cannot explain that. It means the quiz path awards XP again on a re-attempt of
  the same lesson, i.e. `hasXpEvent()` is not gating that path at all, or is called with
  a different `source_id` than the insert uses.

**The constraint will convert that second case from "duplicate XP" into "a silently
ignored award".** That is better, but it is not the same as fixing it. The quiz
re-attempt path deserves its own investigation; it is a behaviour question, not a
concurrency one, and it is out of B8-E's scope. **Filed for a human decision, not
silently absorbed.**

---

## 3. Gate 2 — approval and backup (NOT SATISFIED)

Required before applying, per the roadmap and `FINAL_IMPLEMENTATION_PLAN` §12:

1. **Explicit human approval** to delete 50 rows and remove 510 XP from 16 accounts.
2. **A fresh logical backup taken immediately before the production apply.** The
   rollback restores the *constraint state* only — deleted rows come back from the
   backup or not at all.
3. **A staging apply first**, with seeded duplicates, and a row-count comparison.

None of these has happened. No approval is recorded, and none was inferred.

---

## 4. What was authored

| File | Status |
|---|---|
| `supabase/migrations/20260913000001_xp_event_uniqueness_b8e.sql` | Written, **not applied** |
| `supabase/migrations/rollback/20260913000001_xp_event_uniqueness_b8e.down.sql` | Written, **not applied** |

The migration is three steps inside one transaction: capture the excess rows, delete
them, re-derive affected users' totals, then add the constraint.

### The step the roadmap's spec did not anticipate

`trigger_update_user_xp` fires **AFTER INSERT ON `xp_events` only**
(`20260728000002_create_user_state.sql:101-104`). **There is no delete trigger.**

So deleting ledger rows does *not* reduce `users.total_xp`. A dedupe that stopped at
"delete the duplicates" would leave 16 users holding 510 XP with no ledger behind it —
and because `level` derives from `total_xp`, some could sit at an inflated level
indefinitely. The migration would have *created* a new correctness bug while closing an
old one.

Step 2 handles it: `trigger_sync_user_xp_on_update` fires BEFORE UPDATE ON `users` and
recomputes both columns from the ledger, so a no-op touch of each affected row
re-derives the correct values. The `SET total_xp = u.total_xp` is intentional — the
trigger overwrites it.

### A design correction made during review

The constraint was first written as a **partial** unique index
(`WHERE source_id IS NOT NULL`). That was wrong twice over:

- Postgres already treats NULLs as distinct in a unique index (NULLS DISTINCT), so the
  predicate bought nothing — NULL `source_id` rows never collide regardless.
- A partial index cannot be inferred as an `INSERT ... ON CONFLICT (cols)` target
  without restating its `WHERE` clause, which PostgREST cannot express. It would have
  made the application-side half of this batch impossible to write.

It is now a plain `ALTER TABLE ... ADD CONSTRAINT ... UNIQUE`.

---

## 5. What was deliberately NOT shipped, and why

The roadmap's B8-E also specifies: convert the insert to `ON CONFLICT DO NOTHING`, and
remove the `hasXpEvent()` pre-check.

**Neither was done, and shipping them now would be unsafe.**

`supabase-js` expresses `ON CONFLICT DO NOTHING` as
`.upsert(row, { onConflict: 'user_id,source_type,source_id', ignoreDuplicates: true })`.
If that runs against a database where the constraint does **not** exist, Postgres
raises `there is no unique or exclusion constraint matching the ON CONFLICT
specification` — and **every XP award fails**.

Deploy ordering between the Vercel app and the migration job **is not guaranteed**: that
is I-16-B4, which is unscheduled. So a commit containing both the migration and the code
change has a real window in which the app is live against a database without the
constraint. Awarding no XP is a worse failure than awarding occasional duplicate XP.

Removing `hasXpEvent()` before the constraint exists is worse still — it deletes the
only duplicate protection currently in place.

**Correct sequence, once approval is given:**

1. Take the backup.
2. Apply the migration to staging; verify with seeded duplicates.
3. Apply to production; confirm the constraint exists and row counts reconcile
   (1,636 → 1,586).
4. **Then**, in a separate commit, switch the insert to the conflict-aware form and
   remove the pre-check.

Steps 1–3 are operational. Step 4 is a small follow-up commit that is safe only after
step 3 is confirmed.

---

## 6. Validation performed

| Check | Result |
|---|---|
| B8-D grouping logic | 15 tests passing |
| B8-D run against production | Completed read-only; report committed |
| Migration SQL executed | **No — not run anywhere.** No Docker locally, no staging project (P0-1 outstanding) |
| Application code changed | **None.** No behaviour change ships with this batch |

**The migration SQL has not been executed against any database.** It has been reviewed
by reading, and one design flaw was found and corrected that way (§4), but reading is
not running. The staging apply in step 2 above is its first real test.

---

## 7. Human action required

| # | Action |
|---|---|
| 1 | Approve, or decline, deleting 50 rows / 510 XP across 16 users |
| 2 | Take a fresh logical backup immediately before any production apply |
| 3 | Apply to staging first and verify — note P0-1 (staging project) is still outstanding, so there may be nowhere to do this yet |
| 4 | Decide separately what to do about the `quiz_correct` re-attempt behaviour in §2 |
| 5 | After the constraint is confirmed in production, request the step-4 follow-up commit |

---

*B8-E authored and blocked at its safety gate. Nothing applied, no approval assumed.*
