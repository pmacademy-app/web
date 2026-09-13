# Phase 1 — Implementation TODO

**Source of scope:** [`B7_B14_MASTER_ROADMAP.md`](../B7_B14_MASTER_ROADMAP.md) §5
**Phase 0 status:** ✅ B14-A complete — [`B14A_MIGRATION_DEPLOYMENT_VERIFICATION.md`](B14A_MIGRATION_DEPLOYMENT_VERIFICATION.md)
**Repository state when written:** `bf93bd6` on `b14a/migration-deploy-verification`
**Batches covered:** B8-A · B8-B · B8-C · B8-D · B8-E · B9-A

> Every precondition below was re-verified against the code before this document was written. Where the roadmap and the code disagree, the code wins and the discrepancy is called out.

---

## Status board

| Batch | Status | Risk | Human gate | Report |
|---|---|---|---|---|
| **B8-A** Leaderboard XP column | ✅ **COMPLETE** (`ee7b2e6`) | Low | Production check pending | [B8A](B8A_LEADERBOARD_XP_COLUMN.md) |
| **B8-B** Authoritative XP total | ✅ **COMPLETE** | Low | No | — |
| **B8-C** Bound truncating queries | ✅ **COMPLETE** | Low | No | — |
| **B8-D** XP duplicate diagnostic | ✅ **COMPLETE** — ran against production | Low | **Report ready for review** | [report](B8D_XP_DUPLICATES_REPORT.txt) |
| **B8-E** XP uniqueness constraint | ⏸️ **HELD at staging gate — app half shipped** | **High** | **BLOCKED: staging only** | [investigation](B8E_PRE_APPROVAL_INVESTIGATION.md) · [original](B8E_XP_UNIQUENESS.md) |
| **B9-A** Out-of-band alerting | ✅ **COMPLETE in code** | Low | **Needs `ALERT_WEBHOOK_URL`** | — |

---

## FINAL STATE — 2026-09-13

### Phase 1 safe implementation: **COMPLETE and DEPLOYED TO PRODUCTION**

| | |
|---|---|
| Deployed commit | **`164229a`** on `main` |
| Vercel deployment | `READY`, `aliasAssigned=true`, ready 16:36:58.963Z |
| Verified | 16:42:02Z — **303 s after the deployment went READY** |
| Result | **15/15 production checks pass** |

Deployed and verified in production: **B8-A** (leaderboard XP column), **B8-B**
(authoritative XP total), **B8-C** (bounded truncating queries), **B8-D** (duplicate
diagnostic), **B9-A** (out-of-band alerting, inert pending `ALERT_WEBHOOK_URL`), and the
**`awardXp()` SQLSTATE 23505 handling**.

### B8-E migration: **CORRECTED and PREPARED — NOT production-applied**

**B8-E was not deployed and its migration has not been run against any database.**
Verified after deployment: 47 migrations applied, `20260913000001` remote = `(none)`,
and the 31-row / 310 XP / 13-user target set is **still present in production**, which is
direct proof no dedupe occurred.

The migration is held at `supabase/migrations/pending-approval/`, outside the path the
CLI and the `deploy-supabase` CI job read, so pushing `main` could not and did not apply
it.

### Staging: **intentionally not provisioned**

No staging Supabase project exists. Creating one provisions real infrastructure under the
account and was deliberately not done without explicit approval. Requirements are
documented in [`B8E_PRE_APPROVAL_INVESTIGATION.md`](B8E_PRE_APPROVAL_INVESTIGATION.md) §7.

### B8-E remains separately gated

It is a future controlled operation requiring, in order: a staging project, a passing run
of `supabase/migrations/validation/b8e_staging_validation.sql`, a fresh logical backup,
and then a deliberate `git mv` out of `pending-approval/`. **Nothing about this
deployment advances B8-E.**

---

---

## Recommended execution order

```
B8-A ──► B8-B ──► B8-C ──► B8-D ──[HUMAN REVIEW]──► B8-E
                                                      
B9-A  ── independent, may run in parallel at any point ──►
```

B8-A→E is a strict chain: each touches the file or query surface the next one depends on, and keeping them sequential is what keeps each diff reviewable. B9-A shares no files with the B8 chain and can be slotted wherever convenient — it is placed in Phase 1 for its P0 severity, not for any ordering reason.

---

## B8-A — Correct the leaderboard XP column ✅ COMPLETE

**Finding:** `F-COR-1` · **Priority:** P0 · **Risk:** Low

### Tasks
- [x] Verify `xp_events` column name against `types/database.ts`
- [x] Prove the bug with a failing test before changing code
- [x] `.select('user_id, amount, created_at')` → `xp_amount`
- [x] Correct the inline row type and the reducer
- [x] Capture the discarded `error` and route it through `logErrorReport`
- [x] Regression tests for both the value path and the error path

### Files
`lib/leaderboard-db.ts` (sole source file) · `lib/__tests__/leaderboard-db-xp.test.ts` (new)

### Dependencies
B14-A — satisfied.

### Validation
`npm run test:leaderboard` · targeted new suite · `npm run typecheck` · `npm run lint`

### Human action
None to implement. **Production verification outstanding:** load `/leaderboard` after deploy and confirm non-zero weekly XP.

### Discoveries
See "B8-A completion notes" below — three corrections to the roadmap.

---

## B8-B — Read the authoritative XP total

**Finding:** `F-COR-2` · **Priority:** P0 · **Risk:** Low

### Tasks
- [ ] Confirm the DB trigger genuinely maintains `users.total_xp` before trusting it
- [ ] Rewrite `getTotalXp()` to read `users.total_xp`
- [ ] Decide and implement the fallback when the `users` row is missing (SQL aggregate, not a JS sum)
- [ ] Keep the exported signature unchanged — `awardXp()` and `getUserXpSummary()` both call it
- [ ] Test: a user with >1000 seeded events reports the correct total
- [ ] Test: the level-transition path in `awardXp()` uses the authoritative value

### Files
`lib/xp/xp-service.ts` (`getTotalXp` at `:113-128`; called from `awardXp` at `:35`)

### Dependencies
B8-A. No migration.

### Validation
`npm run test:xp` · `npm run typecheck`

### Human action
None to implement. Production check: compare a power user's reported total against `select total_xp from users where id = …`.

### Pre-verified notes
`supabase/migrations/20260805000001_update_xp_level_trigger.sql` does two relevant things: an **insert trigger** that maintains `users.total_xp` on every `xp_events` insert (`:38`), and an **anti-tampering trigger** that recalculates `total_xp` from `xp_events` on user update (`:59`). The column is therefore both maintained and self-healing, and the recalculation is server-side SQL, so it is not subject to the PostgREST 1000-row cap that causes this bug. Reading the column is sound.

### Explicitly excluded
The trigger itself · `lib/xp/xp.ts` level math · idempotency (B8-E).

---

## B8-C — Bound the queries that silently truncate

**Finding:** `F-COR-4` · **Priority:** P0 · **Risk:** Low

### Tasks
- [ ] Enumerate every `.select()` in both files and classify each: count-only / bounded / needs-all-rows
- [ ] `lib/leaderboard-db.ts` — bound the four unbounded selects at `:107,117,126,137`
- [ ] `lib/admin/dashboard-service.ts` — bound `:102` and `:220,226,232,253,266,272,278`
- [ ] Use `{ count: 'exact', head: true }` for counts (already the pattern at `:96-101`)
- [ ] Use `fetchAllRows()` from `lib/admin/fetch-all.ts` where every row is genuinely needed
- [ ] Address the `.in()` URL-length risk — the leaderboard passes every qualifying user id into a query string
- [ ] Decide whether the weekly roll-up needs a DB-side aggregate; if so, that migration is inseparable from this batch
- [ ] **Carried from B8-A:** stop caching a failed aggregation for the full 45s TTL (`LEADERBOARD_CACHE.set` runs even when a query errored)
- [ ] **Carried from B8-A:** the `users` and `user_leaderboard_settings` selects at `:107-121` still discard their `error`
- [ ] Tests: seeded sets above 1000 rows return complete results; the `.in()` path exercised with a large id list

### Files
`lib/leaderboard-db.ts` · `lib/admin/dashboard-service.ts` · possibly one additive migration

### Dependencies
B8-A, B8-B.

### Validation
`npm run test:leaderboard` · `npm run test:dashboard` · `npm run typecheck`

### Human action
None to implement. If an RPC migration proves necessary, it is **additive and non-destructive** — but it still needs the normal staging-first apply.

### Explicitly excluded
A repo-wide unbounded-query sweep · the repository layer (B8-F).

---

## B8-D — Duplicate XP diagnostic (read-only)

**Finding:** `F-COR-3` precondition · **Priority:** P0 · **Risk:** Low

### Tasks
- [ ] Create `scripts/diagnostics/xp-duplicates.ts` — the directory does not exist yet
- [ ] Report duplicate `(user_id, source_type, source_id)` groups, group sizes, total excess rows, XP at stake
- [ ] Read-only credentials; **user ids only, never emails**
- [ ] Unit-test the grouping logic against a fixture
- [ ] Run against production read-only; commit the output as an artifact under `docs/audits/`
- [ ] **STOP for human review**

### Files
`scripts/diagnostics/xp-duplicates.ts` (new) · its test · an output artifact

### Dependencies
B8-C.

### Validation
Fixture test. The production run is the deliverable, not a test.

### Human action — **REQUIRED**
A human must read the report before B8-E is written. The duplicate count determines whether B8-E's dedupe is trivial or significant, and whether the XP loss is acceptable.

### Constraint
Deletes nothing. Writes no migration. Does not touch `xp-service.ts`.

---

## B8-E — Enforce XP event uniqueness ⚠️ DESTRUCTIVE

**Finding:** `F-COR-3` · **Priority:** P0 · **Risk:** HIGH

### Tasks
- [ ] Write the forward migration: delete duplicates keeping the earliest row per group, then `ADD CONSTRAINT … UNIQUE (user_id, source_type, source_id)`
- [ ] Write the rollback migration **before** applying the forward one
- [ ] Convert the `xp_events` insert to `ON CONFLICT DO NOTHING` (`lib/xp/xp-service.ts:38-45`)
- [ ] Remove the `hasXpEvent()` pre-check from the award path (`:90-111`)
- [ ] Tests: duplicate insert refused; concurrent identical awards produce exactly one row; level transition still fires once
- [ ] Apply to staging with seeded duplicates; compare row counts before/after
- [ ] Reconcile counts against the B8-D report

### Files
One new migration in `supabase/migrations/` · `lib/xp/xp-service.ts`

### Dependencies
B8-D **and** documented human approval of its output.

### Human action — **REQUIRED, TWO GATES**
1. **Explicit approval** to delete duplicate rows, with the B8-D count known.
2. **A fresh logical backup immediately before the production apply.** Deleted rows are recoverable only from that backup.

### Validation
`npm run test:xp` · staging apply with seeded duplicates · row-count comparison · production apply only after both gates.

### Note on current state
`20260824000001_phase9_perf_indexes.sql:5-6` creates a **non-unique** index on exactly these three columns. Verified: no UNIQUE constraint exists anywhere in the 47 applied migrations.

### Explicitly excluded
The same pattern for capstones and lesson progress · retention (B9-D).

---

## B9-A — Deliver critical incidents out of band

**Finding:** `F-REL-4` · **Priority:** P0 · **Risk:** Low

### Tasks
- [ ] **Human decides the channel first** — governed email, webhook, or Telegram
- [ ] Add one notifier module under `lib/monitoring/`
- [ ] Invoke it alongside the existing in-app fan-out in `notifyAdminsOnce()`
- [ ] Reuse the existing 1-hour fingerprint cooldown at `:231-241` — do not add a second dedup mechanism
- [ ] Guarantee a notifier failure is swallowed and never changes the response
- [ ] Preserve the test-environment suppression at `:227`
- [ ] Tests: one external alert per fingerprint per hour; notifier failure swallowed; test-env guard intact

### Files
`lib/monitoring/logger.ts` (call site only) · one new module under `lib/monitoring/`

### Dependencies
B14-A — satisfied. Shares no files with the B8 chain.

### Validation
`npm run test:monitoring` · staging: trigger a critical incident, confirm external delivery, confirm the second is suppressed.

### Human action — **REQUIRED**
1. **Choose the channel** — this is an operator decision, not an engineering one.
2. Provision the channel credential as an env secret.
3. Staging verification is required before this can be called done.

### Pre-verified notes
Alert bodies are already redacted by value shape and key name (ADR-005) before reaching `notifyAdminsOnce`. The notifier must add no unredacted fields. Severity is derived from `kind`, never passed in — `db_unavailable`, `provider_quota` and `config_missing` are the kinds that resolve to `critical` and will therefore reach this channel.

### Explicitly excluded
Sentry · external uptime monitoring (operator task) · any change to fingerprinting or dedup.

---

## B8-A completion notes

Implemented on `b8a/leaderboard-xp-column`, branched from the unmerged B14-A branch. **B14-A is still unmerged and unpushed** — if it is abandoned, this work needs rebasing onto `main`.

### The bug, confirmed
`lib/leaderboard-db.ts:135-141` selected `amount` from `xp_events`. The column is `xp_amount` (`types/database.ts:1997`). PostgREST rejects the unknown column, and the query destructured only `data`, discarding `error`. `data` was therefore `null`, `xpEarned` reduced to `0` for every user, and nothing was logged. Weekly XP has been uniformly zero.

### Three corrections to the roadmap spec

1. **Domain `'data'` does not exist.** The roadmap's implementation note said *"route it through `logErrorReport` with domain `data`"*. `ErrorDomain` (`lib/monitoring/error-taxonomy.ts:27-35`) admits `email | auth | queue | admin | db | webhook | cron | api`. Used **`'db'`**, with `kind: 'db_unavailable'` — the taxonomy's documented meaning is *"the database could not be reached or a required query failed"*, which is exactly this case. It derives to `critical` / `manual_retry`.

2. **There were two broken queries in the same function, not one.** The roadmap cited only the `xp_events` select. The adjacent `user_lesson_progress` select at `:126-133` discarded its `error` identically. Fixing only the cited one would have left `daysStudied` and `lessonsCompleted` able to fail silently in exactly the same way. Both are now checked. This is within B8-A's stated objective — *"a failed query is logged instead of silently producing zeros"* — and does not stray into B8-C, which is about row-limit bounding, not error handling.

3. **A failed aggregation is still cached for 45 seconds.** `LEADERBOARD_CACHE.set(weekStart, cached)` runs regardless of whether the queries succeeded, so a transient failure pins a zeroed board for the full TTL and suppresses recovery on the next request. Pre-existing behaviour, **not fixed here** — changing cache semantics is outside "fix the column and report the error", and B8-C already reworks this function. Filed for B8-C.

### Deliberately not done
Left untouched per the batch's exclusions: the four unbounded selects and the `.in()` URL-length risk in this same function (**B8-C**), `lib/leaderboard.ts` ranking logic, the 45-second cache TTL, and the `DBChain` escape hatch (**B8-F**). The two `users` / `user_leaderboard_settings` selects at `:107-121` still discard their errors — deliberately left, since bounding and typing that surface is B8-C/B8-F work and widening the diff here would blur the batch boundary.

### Validation performed
Recorded in [`B8A_LEADERBOARD_XP_COLUMN.md`](B8A_LEADERBOARD_XP_COLUMN.md).

---

## Implementation outcomes (recorded after the work)

### B8-B — done
`getTotalXp()` reads `users.total_xp`, maintained in SQL by the trigger in
`20260805000001` and re-derived by the anti-tampering trigger on every `users` update.
The ledger sum survives only as a fallback when that row is unreadable, and the fallback
is now **explicitly** bounded at 1,000 rows and logs when it hits the bound — an
unbounded fallback would have recreated F-COR-2 one layer down.

Two existing tests asserted the old contract and were updated rather than deleted:
`performance-optimization.test.ts` (now asserts the authoritative read) and
`settings.test.ts` (its `users` double only implemented `update`; it needed a read path).

### B8-C — done
Every aggregate-feeding query in both files is now paged to completion with
`fetchAllRows()`:

- `dashboard-service.ts` — the genuinely unbounded `users.select('total_xp')`, plus
  seven queries that carried `.limit(5000)`/`.limit(2000)`. Those were *bounded* but
  still silently truncating, which is the same wrong-number problem one cap higher.
- `leaderboard-db.ts` — all four aggregation queries.

Also closed, both carried from B8-A:
- A degraded board is **no longer cached**, so a transient failure no longer pins zeros
  for the full 45-second TTL.
- The `users` and `user_leaderboard_settings` reads now surface their errors. The
  opt-out query **fails the request** rather than continuing, because failing open there
  would publish users who opted out of the leaderboard.

**Two changes beyond the literal spec, both forced by it:**
1. The `.in('user_id', <entire roster>)` filters were removed, not just bounded. The
   week filter already limits the rows and the join now happens in JS, so the filter
   only ever contributed a URL-length failure.
2. The per-user `.filter()` aggregation became a `Map` grouping. It was O(users × events);
   with the queries paged to completion and no longer pre-filtered by user, that cost
   would have compounded.

### B8-D — done, report ready for review
Ran read-only against production. **46 duplicate groups · 50 excess rows · 510 XP ·
16 users** out of 1,636 rows.

Pure logic lives in `apps/web/lib/xp/duplicate-analysis.ts` rather than inside the
script. **Deviation from the spec's "nothing else" scope, and why:** the batch requires
a test of the grouping logic, and vitest only covers `apps/web/lib/__tests__/`, so logic
placed in root `scripts/` would be both untypechecked and untestable.

### B8-E — authored, correctly blocked
See [`B8E_XP_UNIQUENESS.md`](B8E_XP_UNIQUENESS.md). Migration and rollback written;
**nothing applied, no approval assumed**, and the application-side change deliberately
held back because it hard-depends on the constraint existing and deploy ordering is not
guaranteed (I-16-B4 outstanding).

Two findings from that work:
- **Deleting ledger rows does not reduce `users.total_xp`** — the trigger is AFTER
  INSERT only. The migration re-derives affected users' totals; without that step the
  dedupe would have left affected users holding phantom XP and possibly inflated levels.
- **`quiz_correct` duplicates land days apart**, so they are not the race F-COR-3
  describes. Flagged for investigation.

**That investigation was then carried out — see
[`B8E_PRE_APPROVAL_INVESTIGATION.md`](B8E_PRE_APPROVAL_INVESTIGATION.md) — and it found
the migration unsafe as authored.** `quiz_correct` is an intentional incremental top-up,
not a bug; `user_reset` uses a constant `source_id`; and `flashcard` (823 rows, the
largest source type) awards once per day per card. A blanket UNIQUE would have destroyed
280 XP, handed 80 XP back to one user, and broken all three features. The migration is
now scoped to six once-only source types, verified against production to delete exactly
31 rows / 310 XP / 13 users, all `theory_read`.

### B9-A — done in code
Generic HTTPS webhook (`ALERT_WEBHOOK_URL`), chosen because the channel is an operator
decision and a webhook satisfies Slack/Discord/Telegram/PagerDuty without a dependency
or a vendor lock. It shares no infrastructure with Supabase or the email pipeline — the
two things most likely broken when a critical incident fires.

Delivery runs **before** the admin-list lookup: that lookup needs two more successful
database reads and at least one admin row, and returns silently otherwise, which is
exactly the outage this channel exists for. The existing one-per-fingerprint-per-hour
cooldown still gates it; no second dedup was added.

---

## Cross-batch human actions, collected

| # | Action | Blocks | Status |
|---|---|---|---|
| 1 | Verify `/leaderboard` shows non-zero weekly XP after deploy | closing B8-A | ⬜ pending deploy |
| 2 | Decide how `b14a/…` and `b8a/…` reach `main` | deploying anything | ⬜ open |
| 3 | Review the B8-D duplicate report | B8-E | ✅ done — classified in the investigation |
| 4 | Approve deleting **31 rows / 310 XP / 13 users** (corrected scope) | B8-E apply | ✅ **APPROVED 2026-09-13** |
| 5 | Confirm the six once-only source types | B8-E apply | ✅ **CONFIRMED 2026-09-13** |
| 6 | Take a fresh logical backup | B8-E apply | ⚠️ **data-only export taken — not the §18 `pg_dump`** |
| 7 | Provision the staging project (P0-1) | B8-E apply | ⬜ **BLOCKING — confirmed absent; provisioning steps documented** |
| 8 | Set `ALERT_WEBHOOK_URL` in production | B9-A being live | ⬜ **code ships inert without it** |
| 9 | Investigate `quiz_correct` XP re-award on re-attempts | — | ✅ **closed — working as designed** |

---

*Phase 1 planning document. Updated as batches complete. B8-A done; B8-B is next and not started.*
