# B8-E — XP Uniqueness: Execution Record

**Status:** ✅ **APPLIED TO PRODUCTION — 2026-09-13 18:15:34–18:15:39Z**
**Migration:** `supabase/migrations/20260913000001_xp_event_uniqueness_b8e.sql`
**Executed by:** direct-to-production, **explicitly approved without a staging project**

> This document began as a pre-approval investigation. It is retained in full below
> because its analysis is what made the migration safe — it is the reason the original
> blanket-uniqueness design was rejected. The execution record is at the top; the
> investigation follows unchanged.

---

## Execution result

### Decision

Direct production execution was **explicitly approved** without staging. No staging
Supabase project was created; P0-1 remains outstanding. This is recorded as a conscious
decision, not an oversight: the migration was applied to production as its first and
only execution.

### Backup taken beforehand

`backups/b8e-preapply-2026-09-13T1820Z/` — 45 tables, 18,764 rows, 9.1 MB, captured
18:13:38Z, minutes before the apply.

Verified before proceeding: all 45 SHA-256 digests re-checked independently; the 31
target rows re-derived **from the backup file alone** yielding 31 rows / 310 XP / 13
users, each with complete primary key and payload; gitignored and untracked.

**Limitation, stated plainly: this is NOT a `pg_dump`.** It is a data-only PostgREST
export, unencrypted, on local disk. `pg_dump`, `psql`, Docker and Podman are all absent
from the execution host and no database password is available, so the
`FINAL_IMPLEMENTATION_PLAN` §18 method could not be used. It captures no schema, roles,
RLS policies, `auth` schema or storage objects — it is sufficient to restore the deleted
rows, which is what this migration needed, and nothing more.

### Preflight — 10/10, re-derived from live production

| Check | Result |
|---|---|
| Deletion set | **exactly 31 rows** |
| XP removed | **exactly 310** |
| Affected users | **exactly 13** |
| All rows `theory_read` | yes |
| `quiz_correct` in deletion set | none |
| `flashcard` in deletion set | none |
| `user_reset` in deletion set | none |
| Every deleted row has a surviving earlier sibling | yes |
| Index violations remaining after deletion | 0 |
| `users.total_xp` already matched ledger | 13/13 |

Pre-migration totals and levels were captured for all 326 users
(`preflight-snapshot.json`, alongside the backup) so reconciliation could be exact
rather than approximate.

### Applied

```
Applying migration 20260913000001_xp_event_uniqueness_b8e.sql...
{upToDate:false,dryRun:false,migrations:[20260913000001_xp_event_uniqueness_b8e.sql]}
```

48 migrations now applied; `20260913000001` recorded remotely; `db push --dry-run`
reports `upToDate`. No unrelated migration was applied — the pending set was exactly one.

### Post-migration verification — 17/17

**Deduplication**

| Measure | Before | After |
|---|---|---|
| `xp_events` | 1639 | **1608** (−31) |
| `theory_read` | 237 | **206** (−31) |
| `quiz_correct` | 385 | **385** (unchanged) |
| `flashcard` | 823 | **823** (unchanged) |
| `user_reset` | 2 | **2** (unchanged) |

All 31 target rows confirmed gone. Cross-checked against the backup export: **no row
outside the target set was removed.**

**Affected users — all 13 reconcile exactly on both `total_xp` and `level`**

| User | Before | Δ | After | Level |
|---|---|---|---|---|
| ef4b0bad | 200 | −10 | 190 | L1 (unchanged) |
| 216d27c3 | 725 | −50 | 675 | L2 (unchanged) |
| b0ede5c5 | 4231 | −110 | 4121 | L5 (unchanged) |
| c1602ad9 | 720 | −10 | 710 | L2 (unchanged) |
| be1fb420 | 905 | −30 | 875 | L3 (unchanged) |
| 96b048ce | 1137 | −20 | 1117 | L3 (unchanged) |
| 5b570e09 | 449 | −10 | 439 | L2 (unchanged) |
| 977f7392 | 98 | −10 | 88 | L1 (unchanged) |
| 8e685dce | 544 | −10 | 534 | L2 (unchanged) |
| b67abf63 | 454 | −10 | 444 | L2 (unchanged) |
| 5964d91b | 200 | −10 | 190 | L1 (unchanged) |
| 948a7345 | 660 | −10 | 650 | L2 (unchanged) |
| 48aa23a8 | 2060 | −20 | 2040 | L4 (unchanged) |

**No learner lost a level.** No unaffected user’s XP or level changed — verified against
the full 326-user snapshot. `users.total_xp` matches the ledger sum for all 61 users
with XP, confirming the step-3 trigger re-derivation worked.

**Uniqueness — observed, not assumed**

A duplicate `theory_read` insert against a deleted key was **refused with HTTP 409 /
SQLSTATE 23505**, and wrote nothing: that key still holds exactly one row. The
repeatable types remain unconstrained — 16 `quiz_correct` duplicate groups still exist
and were untouched.

**Application**

Health 200 / DB connected; `/`, `/curriculum`, `/leaderboard`, `/login` all non-5xx;
**0 `system_errors` since the migration.**

### `awardXp()` 23505 handling — precise status

The handling is **deployed** (shipped in `510f672`, live since `164229a`) and covered by
9 unit tests, and the database-level refusal it depends on is now **observed in
production**. What has *not* been observed is the two composed end-to-end: no XP has been
awarded since the migration, so no real race has occurred to exercise the swallow path.
Manufacturing one was deliberately avoided — it would alter real learner data.

### Rollback

`supabase/migrations/rollback/20260913000001_xp_event_uniqueness_b8e.down.sql` drops the
index. **It does not restore the 31 deleted rows** — those come from the backup above, or
not at all.

---

# Original pre-approval investigation
# B8-E — Pre-Approval Investigation

**Batch:** B8-E (Phase 1) · **Findings:** `F-COR-3`, plus three new
**Date:** 2026-09-13 · **Access:** READ-ONLY against production. No write, no migration, no delete.
**Outcome:** ⛔ **B8-E as originally authored was UNSAFE. The migration has been corrected.**

---

> # ✅ MERGE HAZARD RESOLVED — the branch is now safe to merge
>
> **Was:** B14-A fixed the `deploy-supabase` job so that it actually runs. That meant any
> migration in `supabase/migrations/` would be applied to production automatically on the
> next merge to `main` — so merging this branch would have applied a destructive,
> unvalidated migration with no further human gate.
>
> **Now:** the migration has been moved to
> `supabase/migrations/pending-approval/20260913000001_xp_event_uniqueness_b8e.sql`.
> The CLI only reads `.sql` files at the top level of `supabase/migrations/`, so it is
> no longer in the auto-apply path. Verified after the move:
>
> ```
> {"upToDate":true,"dryRun":true,"migrations":[],"message":"Remote database is up to date."}
> ```
>
> Releasing it is a one-line `git mv` once staging validation passes — see
> [`supabase/migrations/pending-approval/README.md`](../../supabase/migrations/pending-approval/README.md).

---

## 1. Headline

The original B8-E migration would have deleted 50 rows and removed 510 XP. Investigation
shows **only 31 of those rows are actually duplicates.** The other 19 are legitimate
earnings or legitimate ledger entries, and deleting them would have:

- destroyed **280 XP across 5 users** that was genuinely earned by improving quiz scores, and
- **given one user back 80 XP they had deliberately reset away.**

Worse than the data damage, the blanket `UNIQUE (user_id, source_type, source_id)` would
have **permanently broken three working features**, including the single largest source
type in the ledger.

The migration is now scoped. It deletes 31 rows and 310 XP, all `theory_read`, verified
against production.

---

## 2. `quiz_correct` root cause — NOT a bug

**`hasXpEvent()` is not used on the quiz path at all.** `quiz_correct` implements a
deliberate **incremental top-up**, and it is working as designed.

`lib/academy/lessons-db.ts:247-289`:

```ts
const { data: existingQuizEvents } = await supabase.from('xp_events')
  .select('xp_amount')
  .eq('user_id', userId).eq('source_type', 'quiz_correct').eq('source_id', lessonId)

const alreadyAwardedXp = existingQuizEvents?.reduce((s, e) => s + e.xp_amount, 0) ?? 0
const maxPossibleXp   = correctCount * xpConfig.QUIZ_CORRECT
const incrementalXp   = Math.max(0, maxPossibleXp - alreadyAwardedXp)

if (incrementalXp > 0) await awardXp(supabase, userId, 'quiz_correct', incrementalXp, lessonId)
```

A learner scores 2/5, earning 20 XP. Weeks later they retake and score 5/5: the maximum
is now 50, 20 is already banked, so **30 more** is awarded as a second row on the same
`(user_id, 'quiz_correct', lessonId)`.

The production data confirms this exactly. XP sequences per group:

| User | Lesson | XP sequence | Gap |
|---|---|---|---|
| `6b324583` | `les_4kpbq6` | `[20, 50]` | 22.8 days |
| `6b324583` | `les_8psivf` | `[50, 25]` | 13.7 days |
| `6b324583` | `les_zoyq8a` | `[5, 45, 25]` | 5.0 days |
| `6b324583` | `les_04ix6b` | `[70, 5]` | 10.5 days |

These are not repeats of the same award. Each row is a distinct increment, and the
running total is correct. **There is no bug here to fix.**

### Answers to the specific questions asked

| Question | Answer |
|---|---|
| Why can the same key receive XP again weeks later? | By design — the top-up awards `maxPossible − alreadyAwarded` on each improved attempt. |
| Is `hasXpEvent()` used on the quiz path? | **No.** It is used for `quiz_bonus` (`:260`) but never for `quiz_correct`. |
| Do the check and insert use the same `source_type`/`source_id`? | Yes — both use `('quiz_correct', lessonId)`. The check is a *sum*, not an existence test, which is the whole mechanism. |
| Do retries / re-attempts / different paths explain it? | Re-attempts explain it entirely. One code path, one id scheme. |
| Is this separate from the B8-E concurrency race? | **Yes, completely.** Different cause, different population, and the race fix is wrong for it. |

---

## 3. Duplicate classification — 46 groups, 50 rows, 510 XP

Classified by consecutive-row gap and by source semantics, against production on
2026-09-13. A 5-second window separates "same request storm" from "a later deliberate
action"; the observed gaps are nowhere near that boundary, so the split is unambiguous.

| Category | Groups | Excess rows | XP | Users | Verdict |
|---|---|---|---|---|---|
| **A · Concurrency race** — all `theory_read` | 29 | **31** | **310** | 13 | ✅ **Delete** — real duplicates |
| **B · Quiz incremental top-up** — all `quiz_correct` | 16 | 18 | 280 | 5 | ⛔ **Keep** — legitimately earned |
| **C · Repeat account reset** — `user_reset` | 1 | 1 | −80 | 1 | ⛔ **Keep** — deleting would *add* XP |
| **Total** | 46 | 50 | 510 | 16 | |

### Category A — the genuine bug

All 29 groups are `theory_read`. Consecutive gaps: **min 4 ms, median 278 ms, max
1009 ms.** That is a double-fired request, not a user action.

`markTheoryRead()` (`lib/academy/lessons-db.ts:87-137`) guards on
`existingRead || progress?.theory_read_at` — a check-then-write against
`user_lesson_progress`. `existingRead` is itself a `hasXpEvent()` call at `:170`. Two
concurrent requests both read "not yet read", both proceed, both award. This is exactly
the race `F-COR-3` describes, and the constraint is the right fix.

### Category C — the trap in the data

One group, and it is negative: `user_reset/settings_reset`, XP sequence `[-865, -80]`,
3.1 days apart.

`resetXp()` (`lib/settings/settings-service.ts:116-131`) inserts a **negative** XP event
with the **constant** `source_id: 'settings_reset'`. So every account reset by the same
user collides with the previous one. Both rows are legitimate; the learner reset twice.

The original migration would have deleted the `-80` row — **increasing** that user's
total by 80 XP. A dedupe that hands XP back is the opposite of what the batch intended,
and it would have been invisible in a row-count check.

---

## 4. Three features the blanket constraint would have broken

This is the more serious half of the finding. The data damage is 19 rows; the schema
damage would have been permanent.

Auditing every `awardXp()` call site for `source_id` semantics:

| Source type | `source_id` | Repeatable by design? | Rows in prod |
|---|---|---|---|
| `flashcard` | `flashcardId` | **YES — once per _day_ per card** (`lib/flashcards-service.ts:240-266`) | **823** |
| `quiz_correct` | `lessonId` | **YES — incremental top-up** | 384 |
| `user_reset` | `'settings_reset'` (constant) | **YES — every reset collides** | 2 |
| `theory_read` | `lessonId` | No — once per lesson | 236 |
| `quiz_bonus` | `lessonId` | No — guarded by `hasXpEvent` | 173 |
| `reflection` | `lessonId` | No — guarded | 13 |
| `capstone` | `moduleSlug` | No — guarded | 3 |
| `streak` | `streak-<date>` | No — id carries the day | 2 |
| `admin_reset` | — | Type declared, never used | 0 |

**`flashcard` is the largest source type in the ledger at 823 rows**, and it awards once
per day per card. It shows no duplicates today only because no learner has yet re-reviewed
the same card on two different days. The blanket constraint would have started silently
dropping those awards the first time one did — a bug that would have been extremely hard
to trace back to this migration.

---

## 5. B8-E migration review, and the corrections made

Reviewed against the findings above. Four items checked, two defects found and fixed.

| Check | Result |
|---|---|
| Dedupe keeps the intended canonical row | ✅ `ORDER BY created_at ASC, id ASC`, `rn > 1` — keeps the earliest, deterministic on ties |
| `users.total_xp` correctly re-derived | ✅ Step 3 touches affected rows so the BEFORE UPDATE trigger recomputes from the ledger |
| UNIQUE valid for the intended `ON CONFLICT` | ⚠️ **See below — this changed the app-side plan** |
| Rollback coherent | ⚠️ **Fixed** — it restored an index the forward migration no longer drops |
| Hidden data-loss | ⛔ **Found and fixed** — 19 legitimate rows were in scope |
| Deployment-order issue | ⛔ **Still real** — see §6 |

### Correction 1 — scope the dedupe and the constraint

The migration now joins against an explicit allowlist of six once-only source types and
deletes only within them. Verified against production:

```
MIGRATION WOULD DELETE: rows=31 xp=310 users=13
  by type: {"theory_read": 31}
Remaining violations after delete: 0
PRESERVED (excluded types): rows=19 xp=200
```

31 rows deleted, exactly Category A. 19 rows preserved, exactly Categories B + C
(280 + −80 = 200 XP). Zero rows would violate the new index.

### Correction 2 — partial index, and what it means for the app

The constraint is now a **partial** unique index restricted to the six once-only types.

The earlier B8-E report argued *against* a partial index because it cannot be inferred as
an `INSERT ... ON CONFLICT (cols)` target without restating its `WHERE` clause, which
PostgREST cannot express. **That reasoning was right, and it now forces a different
application-side design** rather than a different index:

> The follow-up must treat a unique violation (**SQLSTATE 23505**) as "already awarded"
> and swallow it, rather than using `ON CONFLICT DO NOTHING`.

This is arguably better anyway: it keeps the intent explicit at the call site, and it
works identically whether or not the index exists — which removes the deploy-ordering
hazard that blocked the original app-side change.

### Correction 3 — rollback

The forward migration no longer drops `idx_xp_events_user_source`, so the rollback no
longer recreates it. It now drops only the partial unique index, and documents that
reverting turns a loud unique violation back into silent check-then-write behaviour.

---

## 6. Human decisions still required

None of these has been made, and none was assumed.

| # | Decision | Detail |
|---|---|---|
| 1 | **Approve deleting 31 `theory_read` rows / 310 XP from 13 users** | This is the corrected, verified scope — not the original 50 rows / 510 XP |
| 2 | **Confirm the six once-only source types** | `theory_read, quiz_bonus, reflection, streak, referral, capstone` — a product judgement, not purely technical |
| 3 | **Take a fresh logical backup** immediately before the production apply | Deleted rows are recoverable only from it |
| 4 | **Provision a staging project (P0-1)** | See §7 — the gate cannot currently be satisfied |
| 5 | **Decide on `user_reset`'s constant `source_id`** | Working but fragile; a per-reset id would be cleaner. Not required for B8-E |

**Explicitly NOT required any more:** approval for the quiz_correct and user_reset rows.
The corrected migration does not touch them.

---

## 6b. Approval and backup status — updated 2026-09-13

### Approvals granted

| # | Decision | Status |
|---|---|---|
| 1 | Delete only the 31 `theory_read` rows / 310 XP / 13 users | ✅ **APPROVED** |
| 2 | Preserve all 19 `quiz_correct` and `user_reset` rows | ✅ **APPROVED** |
| 3 | Six once-only source types confirmed | ✅ **APPROVED** |
| 4 | `quiz_correct` working as designed — no change | ✅ **CONFIRMED** |
| 5 | Corrected design: partial unique index + SQLSTATE 23505 handling | ✅ **APPROVED** |

### Backup — taken, with a stated limitation

A logical export of production was created at `backups/b8e-2026-09-13/`:
**45 tables, 18,710 rows, 8.9 MB**, one NDJSON file per table plus `manifest.json`.

Verified:
- All 45 files match their manifest byte counts; no unexpected empty file.
- All 45 SHA-256 digests re-verified independently of the writer.
- **The 31 rows the migration would delete are present and complete** — re-derived from
  the backup file alone, yielding 31 rows / 310 XP / 13 users, each with `id`,
  `user_id`, `source_type`, `source_id`, `xp_amount` and `created_at`. They are
  restorable by insert.
- No service-role or anon key appears in any backup file; the manifest records the host
  only.
- `backups/` added to `.gitignore` **before** the export ran. Confirmed invisible to git.

**⚠️ This is NOT the backup described in `FINAL_IMPLEMENTATION_PLAN` §18**, and the
difference matters:

| §18 requires | What exists |
|---|---|
| `pg_dump` | PostgREST data export |
| gpg-encrypted at rest | **Plaintext.** Contains 325 user records including emails |
| GitHub Actions artifact | Local disk only, single copy |
| Schema + roles + policies | **Data only** |
| `auth.users`, storage objects | **Not captured** |

It is sufficient for this migration — the schema is reproducible from
`supabase/migrations/`, and the deleted rows are recoverable. It is **not** disaster
recovery.

**Why a real `pg_dump` could not be produced, precisely:**

1. **No `pg_dump` binary.** `pg_dump`, `psql`, `docker` and `podman` are all absent from
   this machine. `supabase db dump` shells out to a container and fails with
   `LegacyDockerRunError`.
2. **No database password.** `SUPABASE_DB_PASSWORD` is not in the environment, not in
   `apps/web/.env.local`, and `supabase/.temp/pooler-url` carries no password segment.

To produce the §18 backup, **one of** the following is needed:

- the `SUPABASE_DB_PASSWORD` (or a direct connection string) **plus** PostgreSQL client
  tools or a container runtime on the machine running it; **or**
- implementation of the I-01-B5 backup workflow, which runs `pg_dump` in Actions where
  both are already available; **or**
- a manual dump from the Supabase dashboard (Database → Backups), downloaded and stored
  outside the repository.

Given the approval to proceed, the plaintext local export is the mitigation actually in
place. **Whether that is sufficient for a destructive production migration is a human
call**, and it is recorded here rather than assumed.

---

## 7. Staging — the gate cannot currently be satisfied

`FINAL_IMPLEMENTATION_PLAN` §19 requires every migration to reach staging first.

**Re-confirmed 2026-09-13: there is no staging Supabase project, and no configuration
for one.** Evidence:

- Zero matches for `staging` across `supabase/`, `.github/`, `docs/DEPLOYMENT.md`, and
  the app config.
- No `STAGING_SUPABASE_URL`, `SUPABASE_STAGING_URL`, `NEXT_PUBLIC_SUPABASE_URL_STAGING`
  or `STAGING_DB_URL` in `apps/web/.env.local`.
- `supabase/.temp/linked-project.json` names exactly one project, `pmacademy-app`,
  which is production.

**No infrastructure was created and no paid resource consumed.** Provisioning was not
attempted, per instruction.

**The validation is written and ready to run** — see
`supabase/migrations/validation/b8e_staging_validation.sql`. It seeds one user per
scenario, asserts all eight required checks, and refuses to run against a database with
more than 100 users so it cannot be pointed at production by accident.

### Exact minimum to provision staging — 2026-09-13

`supabase projects list` confirms **one** project in the `PM Academy` organisation:
`pmacademy-app`, `ap-south-1`, `ACTIVE_HEALTHY`, currently linked. There is no second
project of any kind.

The CLI session **does** hold a valid access token and could create a project. It was
**not** used to do so: creating a project provisions real infrastructure under the
account, and the approval given covers B8-E's data changes, not infrastructure. Supabase
also limits free projects per organisation, and that quota cannot be read without
attempting the create.

**What a human must do:**

```bash
# 1. Create the project. Choose a strong password and store it in a password manager —
#    it cannot be retrieved later, only reset.
npx supabase projects create prodily-staging \
  --org-id <PM Academy org id> \
  --region ap-south-1 \
  --db-password '<new strong password>'

# 2. Apply the full migration history (47 migrations) to it.
npx supabase link --project-ref <new staging ref> --password '<password>'
npx supabase db push

# 3. Confirm the link points at staging before anything else runs.
npx supabase projects list    # the staging ref must show "linked": true
```

Then supply, as environment variables and never in a committed file:

| Variable | Purpose |
|---|---|
| `STAGING_DB_URL` | `psql` connection string for the validation script |
| `NEXT_PUBLIC_SUPABASE_URL` (staging) | app + verification reads |
| `SUPABASE_SERVICE_ROLE_KEY` (staging) | app + verification reads |

**Prerequisite still missing either way:** the validation script runs under `psql`, which
is **not installed on this machine** (nor are `pg_dump`, Docker or Podman). Running it
needs PostgreSQL client tools, or a container runtime, or execution from the Supabase
dashboard SQL editor.

Per §19 rule 3, staging must be seeded with **synthetic data only** — never a copy of
production. The validation script seeds exactly what it needs.

To provision it, per §19:

1. Create a new free Supabase project.
2. Apply the full migration history (all 47) to it.
3. Seed **synthetic** data only — never a production copy.
4. Add its URL to the redirect allowlist explicitly, no wildcards (L-06).
5. Point GitHub Actions secrets at it for CI.

**What must be verified there before production:**

- Seed `theory_read` duplicates and confirm exactly the excess rows are deleted.
- Seed `quiz_correct` top-ups, `flashcard` multi-day rows and two `user_reset` rows, and
  confirm **none** is touched.
- Confirm `users.total_xp` and `level` are re-derived for affected users and unchanged
  for everyone else.
- Attempt a duplicate `theory_read` insert and confirm SQLSTATE 23505.
- Attempt a second `flashcard` award for the same card on a later date and confirm it
  **succeeds**.
- Run the rollback, then the forward migration again.

The last two are the regression tests for exactly the failure the original migration
would have shipped.

---

## 7b. Execution status — 2026-09-13

Recorded so nothing here is mistaken for having been done.

| Step | Status | Evidence |
|---|---|---|
| 1 · Repository safety | ✅ **DONE** | Branch `b8a/leaderboard-xp-column` @ `6f6dc22`, unpushed. `db push --dry-run` listed exactly one pending migration, confirmed to be the corrected scoped version (allowlist present, no blanket constraint). `migration list` shows `20260913000001` `remote=(none)` — **not applied**; 47 others applied. Production baseline re-read: `xp_events` 1636, `users` 325. |
| 2 · Staging | ⛔ **BLOCKED — not provisioned** | One project exists (production). Provisioning requirements documented in §7. **No infrastructure created.** |
| 2b · Staging validation | ⛔ **NOT RUN** | Requires staging. Script written and ready. |
| 3 · Production backup (`pg_dump`) | ⛔ **NOT POSSIBLE HERE** | No `pg_dump`/`psql`/Docker/Podman; no database password. Data-only PostgREST export from the prior session retained at `backups/b8e-2026-09-13/` (45 tables, 18,710 rows, verified). **Not encrypted, not a `pg_dump`.** |
| 4 · Production preflight | ⛔ **NOT RUN** | Gated on steps 2–3. |
| 5 · Production apply | ⛔ **NOT RUN** | Gated. **Nothing was applied to production.** |
| 6 · Production verification | ⛔ **NOT RUN** | Gated. |
| — · `awardXp()` 23505 handling | ✅ **IMPLEMENTED + TESTED, not deployed** | `lib/xp/xp-service.ts`; 9 tests in `lib/__tests__/xp-award-duplicate-handling.test.ts`. Safe to ship ahead of the migration — it is error handling, not `ON CONFLICT`, so it is inert until the index exists. |
| — · Migration made non-deployable | ✅ **DONE** | Moved to `supabase/migrations/pending-approval/`; `db push --dry-run` now reports `upToDate: true`. |

### Post-deployment confirmation — 2026-09-13, 16:42:02Z

`main` was pushed and deployed to production as `164229a`. **B8-E was not applied**,
confirmed 303 s after the deployment went READY:

- `supabase migration list --linked` → 47 applied; `20260913000001` remote = `(none)`.
- The target set is **still present in production**: 31 rows / 310 XP / 13 users — direct
  proof no dedupe ran.
- `quiz_correct` 384, `flashcard` 823, `user_reset` 2 — all legitimate rows intact.

`xp_events` read 1637 rather than the 1636 baseline. Reconciled: a single genuine
`theory_read` award at 16:39:01Z from a real learner during the deploy window. One row
since the 16:31:44Z baseline, and the count moved **up**, whereas B8-E would have moved it
down to 1605.

**Production was not modified in any way during this session.** Every call was a `GET`
or a `--dry-run`.

---

## 8. Recommended execution sequence

1. **Human approves** the corrected scope (§6 items 1–2).
2. **Provision staging** (§7). If this is declined, that is a conscious decision to apply
   an untested destructive migration to production, and should be recorded as such.
3. **Verify on staging** against the checklist in §7.
4. **Fresh logical backup** of production, verified restorable.
5. **Apply to production.** Expect: `xp_events` 1636 → 1605; 13 users' `total_xp` reduced
   by their share of 310.
6. **Verify production:** row count, the 13 users' totals and levels, spot-check that a
   `quiz_correct` top-up pair and the `user_reset` pair both survive.
7. **Separate follow-up commit:** swallow SQLSTATE 23505 in `awardXp()` as
   "already awarded". Safe in either order now (§5, correction 2), but still cleaner
   after step 6.
8. **`quiz_correct`: no action.** Working as designed. Close the item.

---

## 9. Additional bugs discovered

| # | Issue | Severity | Status |
|---|---|---|---|
| 1 | **`theory_read` race is not fixed by the constraint alone.** The constraint stops the duplicate row, but `markTheoryRead()` will then throw on the losing request, and its caller logs and continues — so the learner sees a failed request. Needs the 23505 swallow from step 7. | Medium | Filed, not fixed |
| 2 | **`user_reset` uses a constant `source_id`.** Works, but it means the ledger cannot distinguish two resets, and it is why Category C exists. A per-reset id would be cleaner. | Low | Filed |
| 3 | **`flashcard` day-scoping lives in JS, not the id.** `streak` puts the date in `source_id` (`streak-<date>`); `flashcard` re-derives "today" in application code from the user's timezone. The `streak` pattern is safer and would let `flashcard` join the constrained set. | Low | Filed |
| 4 | **`admin_reset` is declared but never used** (`lib/xp/xp.ts:112`). Dead type. | Trivial | Filed |

None of these blocks B8-E.

---

*Investigation complete. Nothing applied, nothing deleted, no approval assumed.*
