# B8-A — Leaderboard XP Column Correction

**Batch:** B8-A (Phase 1) of [`B7_B14_MASTER_ROADMAP.md`](../B7_B14_MASTER_ROADMAP.md)
**Finding addressed:** `F-COR-1`
**Branch:** `b8a/leaderboard-xp-column`, branched from `bf93bd6` (B14-A)
**Date:** 2026-09-13
**Status:** Complete in code · production verification outstanding

---

## 1. The defect

`lib/leaderboard-db.ts` selected `amount` from `xp_events`. The column is `xp_amount` (`types/database.ts:1997`).

Three things compounded into a silent failure:

1. `.select('user_id, amount, created_at')` requests a column that does not exist. PostgREST rejects the query.
2. The call destructured only `data` — `const { data: xpEvents } = ...` — so the returned `error` had nowhere to go.
3. On error `data` is `null`, and the reducer runs over `(xpEvents || [])`, which yields `0`.

The result: **every user's weekly XP has been 0**, and the failure produced no log line, no incident, and no visible error. A metric that degrades to zero rather than to an error is indistinguishable from a quiet week, which is why this survived unnoticed.

Verified at `87c11df`: the roadmap's cited locations `:138`, `:141` and `:160` match the original file exactly.

---

## 2. What changed

`lib/leaderboard-db.ts` only.

| Change | Location |
|---|---|
| `.select('user_id, amount, created_at')` → `xp_amount` | `:137` (was) |
| Inline row type `amount: number` → `xp_amount: number` | `:141` (was) |
| Reducer `curr.amount` → `curr.xp_amount` | `:160` (was) |
| Capture `error` on the `xp_events` query and report it | new |
| Capture `error` on the `user_lesson_progress` query and report it | new |
| `reportLeaderboardQueryFailure()` helper | new, module-private |

Plus `lib/__tests__/leaderboard-db-xp.test.ts` — a new 7-case regression suite.

### Why the lesson-progress query was included

The roadmap cited only the `xp_events` select. The adjacent `user_lesson_progress` select discarded its `error` in exactly the same way, feeding `daysStudied` and `lessonsCompleted`, which degrade to zero identically.

Fixing only the cited query would have left the same class of invisible failure live in the same function, two statements away. The batch objective is *"a failed query is logged instead of silently producing zeros"*, and this is squarely that. It is **not** B8-C work: B8-C is about row-limit bounding and the `.in()` URL-length risk, neither of which is touched here.

### The reporting helper

```
kind:   'db_unavailable'   → derives to severity 'critical', retryability 'manual_retry'
domain: 'db'
```

`db_unavailable` is the taxonomy's documented entry for *"the database could not be reached or a required query failed"* (`lib/monitoring/error-taxonomy.ts:51-52`), which is precisely this case. Severity is derived from `kind` and never passed at a call site, per ADR-004.

The helper is wrapped in `try/catch` and swallows its own failures — instrumentation must never change what the caller receives. The leaderboard is still returned on a failed aggregation: a partially-correct board beats a blank page, and the incident now carries the signal.

### Correction to the roadmap spec

The roadmap's implementation note said to use **domain `data`**. There is no such domain — `ErrorDomain` (`lib/monitoring/error-taxonomy.ts:27-35`) admits `email | auth | queue | admin | db | webhook | cron | api`. Used `'db'`.

---

## 3. Validation performed

Test-first: the regression suite was written and run **before** the source change, and failed on 4 of 7 cases — `xpEarned` was `0` where 100 was expected, the selected column was `amount`, and neither query failure was reported. Those 4 are the defect.

| Check | Command | Result |
|---|---|---|
| New regression suite | `npx vitest run lib/__tests__/leaderboard-db-xp.test.ts` | **7 passed** (4 previously failing) |
| Existing leaderboard suite | `npm run test:leaderboard` | **4 passed** |
| Full unit + integration suite | `npm run test` | **130 files, 1485 tests passed** |
| Type check | `npm run typecheck` | **clean** |
| Lint | `npm run lint` | **0 errors**, 35 warnings — all pre-existing, none in either changed file (grep-confirmed) |
| Diff review | `git diff` | 1 source file, +68/−6; no unintended change |

### What the suite pins

1. The query requests `xp_amount` and not a bare `amount`.
2. A user with 30 + 70 XP in the week reports `xpEarned === 100`, not `0`.
3. `lessonsCompleted` and `daysStudied` still aggregate correctly.
4. An `xp_events` query error produces exactly one incident with `domain: 'db'`, `kind: 'db_unavailable'`, `operation: 'leaderboard.weekly_xp_events'`.
5. A `user_lesson_progress` query error reports under its own operation name.
6. Two successful queries report nothing.
7. A failure *inside the incident sink* does not propagate to the caller.

Not verified: behaviour against the live database. See §5.

---

## 4. Deliberately not done

Per the batch's stated exclusions, and left for the batches that own them:

| Left alone | Owner |
|---|---|
| The four unbounded `.select()` calls in this function | B8-C |
| The `.in()` URL-length risk with every qualifying user id | B8-C |
| A failed aggregation still caching a zeroed board for the full 45s TTL | B8-C *(newly filed)* |
| `users` / `user_leaderboard_settings` selects at `:107-121` still discarding `error` | B8-C *(newly filed)* |
| `lib/leaderboard.ts` ranking logic | — |
| Cache TTL | — |
| The `DBChain` escape hatch | B8-F |

The two newly-filed items were found while working in this function and are recorded in [`PHASE1_IMPLEMENTATION_TODO.md`](PHASE1_IMPLEMENTATION_TODO.md) under B8-C. Neither is a regression introduced here.

---

## 5. Human action required

| # | Action | Why |
|---|---|---|
| 1 | **After deploy, load `/leaderboard` and confirm non-zero weekly XP** for a user with recent activity. | The batch's stated production verification. Cannot be satisfied locally. |
| 2 | Decide how `b14a/migration-deploy-verification` and `b8a/leaderboard-xp-column` reach `main`. | Both branches are unmerged and unpushed. B8-A is stacked on B14-A; if B14-A is abandoned, this needs a rebase. |
| 3 | Expect a `system_errors` row if either aggregation query ever fails. | New behaviour. It derives to `critical`, so once B9-A ships it will also reach the out-of-band channel. |

### A note on what this fix does and does not restore

The column fix makes weekly XP correct **from the moment it deploys**. It does not backfill anything — `xp_events` rows were always written correctly, only the read was broken, so historical weeks become correct as soon as they are read again. No data repair is needed.

---

*B8-A complete. B8-B not started.*
