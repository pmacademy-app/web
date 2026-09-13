# B14-A — Migration Deployment Verification & CI Guard Audit

**Batch:** B14-A (Phase 0) of [`B7_B14_MASTER_ROADMAP.md`](../B7_B14_MASTER_ROADMAP.md)
**Findings addressed:** `F-REL-7` (silent-skip migration guard), `N-1` (unverified production migration state)
**Repository state at audit:** `main` @ `87c11df`
**Date:** 2026-09-13
**Verification method:** Supabase CLI v2.117.0, read-only commands against the linked production project. No migration applied, no row mutated.

---

## 1. Headline result — `N-1` is FALSE

**All three hardening migrations are applied in production.** The worst case this batch was created to rule out did not happen.

`docs/HARDENING_LEDGER.md` records B1 and B6 as *"Complete in code · ⚠️ migration not yet applied"*, and the roadmap escalated that into `N-1`: the possibility that `consume_rate_limit` was missing and the B5 fail-closed rate limiter was therefore returning 429 on `/api/auth/login` and `/api/auth/signup` for every real user.

That is not the case. The ledger's note was stale.

### Evidence

`npx supabase migration list --linked` returned 47 migrations, every one with `local` equal to `remote`. The three in question:

| Migration | Local | Remote | Applied at |
|---|---|---|---|
| `20260909000001_signup_abuse_email_governance.sql` | `20260909000001` | `20260909000001` | 2026-09-09 00:00:01 |
| `20260910000001_security_hardening_b1.sql` | `20260910000001` | `20260910000001` | 2026-09-10 00:00:01 |
| `20260910000002_queue_reliability_b6.sql` | `20260910000002` | `20260910000002` | 2026-09-10 00:00:02 |

Independently corroborated by `npx supabase db push --dry-run`, which reported:

```json
{"upToDate":true,"dryRun":true,"migrations":[],"seeds":[],"roles":[],
 "message":"Remote database is up to date."}
```

There are **zero pending migrations**. The remote schema matches `supabase/migrations/` exactly.

---

## 2. Status of the two critical database functions

| Function | Created by | Status | Basis |
|---|---|---|---|
| `public.consume_rate_limit(p_key text, p_limit int, p_window_ms bigint)` | `20260909000001` line 140 | **PRESENT** | Inferred — see below |
| `public.reclaim_stale_processing_items(p_stale_interval_seconds int, p_max_reclaim int)` | `20260910000002` line 17 | **PRESENT** | Inferred — see below |

### Basis for the inference, and its one caveat

`supabase db push` applies each migration file inside a transaction and records its version in `supabase_migrations.schema_migrations` only after the file executes successfully. A recorded version therefore implies the entire file ran. Both versions are recorded remotely, and each file creates one of these functions as a top-level statement, so both functions exist.

**Residual uncertainty, stated rather than glossed:** a version can also be written into `schema_migrations` by `supabase migration repair` *without* the SQL ever executing. Nothing in this audit rules that out. The inference is strong but not a direct observation.

**Direct confirmation was attempted and is not available from this workstation:**

- A PostgREST probe (reading `apps/web/.env.local` and calling the REST endpoint) was **blocked by the sandbox policy** in this environment. Not retried by other means.
- `supabase db dump --linked --schema public` **requires Docker**, which is not installed here. It failed with `LegacyDockerRunError`, producing an empty file. Any grep result against that file is meaningless and none is reported.

**One-line direct confirmation**, if wanted — run in the Supabase SQL editor, read-only:

```sql
select proname, pg_get_function_identity_arguments(oid) as args
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('consume_rate_limit', 'reclaim_stale_processing_items');
```

Expect exactly two rows. Calling either function directly is **not** a valid check — both mutate.

---

## 3. CI guard finding

### What was there

`.github/workflows/ci.yml`, the `deploy-supabase` job's single operative step:

```yaml
      - name: Link Project & Deploy Migrations
        if: env.SUPABASE_ACCESS_TOKEN != '' && env.SUPABASE_PROJECT_ID != ''
        run: |
          npx supabase link --project-ref "${{ secrets.SUPABASE_PROJECT_ID }}" --password "${{ secrets.SUPABASE_DB_PASSWORD }}" --yes
          npx supabase db push --password "${{ secrets.SUPABASE_DB_PASSWORD }}"
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
          SUPABASE_PROJECT_ID: ${{ secrets.SUPABASE_PROJECT_ID }}
```

### Confirmed defects

**D1 — Silent skip. Confirmed, and the reason this batch exists.**
Whatever the guard evaluates to, a `false` result *skips* the step and the job reports **success**. A run in which no migration was applied is indistinguishable in the Actions UI from a run in which every migration was applied. This is the defect, and it holds regardless of the `env`-context question below.

**D2 — Unset secrets render as empty strings.** A GitHub secret that was never configured interpolates to `''`, so the guard's own condition turns it off. The guard is therefore self-disabling in exactly the situation where a human most needs to be told something is wrong.

**D3 — `SUPABASE_DB_PASSWORD` had no presence check at all.** It appears only inline in the `run:` body. If it alone were missing, the guard passed and `supabase link` failed on a password prompt or auth error — a different and more confusing failure than the one the guard was written to prevent.

**D4 — Secrets interpolated into the `run:` body.** `${{ secrets.SUPABASE_DB_PASSWORD }}` is rendered into the shell script, placing the password on the process command line on the runner. GitHub masks secrets in *log output*, which is not the same as keeping them out of an argument vector.

**D5 — No `timeout-minutes` on the job.** A hung `supabase link` against an unreachable database could occupy a runner for the default six hours.

**D6 — No post-push verification.** `supabase db push` exiting zero was treated as proof of a completed deploy. Nothing asserted that the remote schema had actually converged.

### The `env`-context question — NOT resolved, and deliberately made moot

The roadmap and `FINAL_IMPLEMENTATION_PLAN.md` §3.2 assert that step-level `env` is out of scope for that same step's `if`, so the condition always evaluated false and the step never ran.

**This audit could not confirm that mechanism, and the evidence now points the other way.** GitHub's documentation lists `env` as an available context for `jobs.<job_id>.steps[*].if`, and the migrations *are* applied in production — which is at least consistent with the step having run. It is equally consistent with someone having applied them manually from a linked workstation; this repository is linked, and the credentials to do so are present locally.

Determining which requires an Actions run log, which is not available from the repository. **Classified: NEEDS FURTHER INVESTIGATION — and intentionally not pursued**, because the rewrite removes the conditional entirely. The question stops having consequences.

---

## 4. The fix

`deploy-supabase` was restructured so that no step carries a condition. Verified: **0 steps with an `if:`**, so no silent-skip path exists.

| Step | Purpose |
|---|---|
| Checkout / Setup Node | unchanged |
| **Assert Supabase deployment credentials are present** | Fails with a `::error` naming each missing secret. Covers all **three** secrets, closing D3. |
| **Link Supabase project** | `--project-ref` from the job `env`, not inline interpolation. |
| **Migration state BEFORE push** | `supabase migration list --linked` — printed to the log. |
| **Push pending migrations** | `supabase db push`. |
| **Migration state AFTER push** | `supabase migration list --linked` again. |
| **Verify no migrations remain pending** | `supabase db push --dry-run`; fails unless the remote reports up to date. Closes D6. |

Also applied: all three secrets moved to job-level `env` and referenced as shell variables (D4); `timeout-minutes: 15` added (D5).

**D4 is partially, not fully, addressed — stated precisely.** No secret is `${{ }}`-interpolated into a `run:` body any more, which removes the template-substitution surface GitHub warns about. `--password "${SUPABASE_DB_PASSWORD}"` is still passed as a CLI argument, so the value remains visible in the runner's process table for the life of the command. Dropping the flag in favour of the CLI's `SUPABASE_DB_PASSWORD` environment fallback would close that too, but `supabase link --help` on v2.117.0 does not document the fallback, and betting the migration job on undocumented behaviour risks an interactive password prompt in CI. The explicit flag was kept as the lower-risk option. Revisit if the fallback becomes documented.

The before/after pair means a run's log answers *"what did this change?"* without anyone needing production access — which is the condition that let the ledger's stale note stand unchallenged for three days.

### Assertion robustness

The pending-migration check matches the structured `"upToDate": true` field as its primary signal, with the prose forms as a cross-version fallback. It **fails closed**: unrecognised output, empty output, and connection errors all fail the job rather than passing it.

---

## 5. Validation performed

All local. No CI run has exercised this yet.

| Check | Result |
|---|---|
| YAML parses (`js-yaml`) | PASS |
| No tab characters | PASS |
| `bash -n` on all 6 `run:` blocks | PASS |
| Steps carrying a conditional | 0 (expected 0) |
| `env.*` references in step conditions | none (expected none) |
| Inline `${{ secrets.* }}` in step bodies | 0 (expected 0) |
| `build-and-validate` job unchanged | PASS |

**Credential assertion, behavioural:**

| Case | Expected | Actual |
|---|---|---|
| All three present | exit 0 | exit 0 |
| All three absent | exit 1, all three named | exit 1 ✓ |
| Only `SUPABASE_DB_PASSWORD` absent | exit 1, names only it | exit 1 ✓ |
| `SUPABASE_ACCESS_TOKEN=""` (unset-secret shape) | exit 1 | exit 1 ✓ |

**Pending-migration assertion, behavioural:**

| Case | Expected | Actual |
|---|---|---|
| Real CLI JSON, `upToDate:true` | exit 0 | exit 0 ✓ |
| JSON with `upToDate:false` + pending list | exit 1 | exit 1 ✓ |
| Legacy prose "Remote database is up to date." | exit 0 | exit 0 ✓ |
| Prose listing pending migrations | exit 1 | exit 1 ✓ |
| Empty output | exit 1 | exit 1 ✓ |
| Connection-error text | exit 1 | exit 1 ✓ |

### Disclosure — an unintended command against production

While testing the pending-migration assertion, a PATH stub intended to shim `npx` did not take effect (Git Bash resolved `npx` to the real executable). As a result `npx supabase db push --dry-run` executed against the **live linked project** rather than against the stub.

The command is a dry run. Its own output states `migrations will *not* be pushed to the database`, and it returned `"dryRun":true,"migrations":[]`. **Nothing was applied and no row was written.** It is recorded here because it was not the command that was intended to run at that moment, and because its output is part of the evidence above. Subsequent assertion tests were re-run against piped fixtures rather than the CLI.

---

## 6. Files changed

| File | Change |
|---|---|
| `.github/workflows/ci.yml` | `deploy-supabase` job rewritten — fail-loud credential assertion, before/after migration state, post-push verification, job-level secret env, `timeout-minutes` |
| `docs/audits/B14A_MIGRATION_DEPLOYMENT_VERIFICATION.md` | This report (new) |

No application code, no migration file, no test, no dependency, and no other workflow was touched.

---

## 7. Corrections owed to other documents

Not applied here — out of B14-A's scope — but recorded so they are not lost:

1. **`docs/HARDENING_LEDGER.md`** marks B1 (row 2) and B6 (row 8) as *"migration not yet applied"*. Both **are** applied. The chronology table and the B1/B6 "Remaining Limitations & Environment Note" sections are stale.
2. **`docs/ISSUES_KNOWN.md` ISSUE-24** says migration `20260909000001` still needs applying. It is applied.
3. **`docs/B7_B14_MASTER_ROADMAP.md` `N-1`** is resolved and should be struck. `F-REL-7` remains valid as a *process* defect but its severity drops from Critical to Medium: the silent-skip path was real, but it did not cause the outcome the roadmap feared.
4. **Roadmap §1 and §9 item 2** assert that the migration question blocks everything. It no longer does. **Phase 1 (B8-A onward) is unblocked.**

---

## 8. Human action required

| # | Action | Why |
|---|---|---|
| 1 | **Observe one `main` run of `deploy-supabase`** and confirm the deploy steps execute rather than skip. | The completion criterion this audit cannot satisfy locally. Expect the "Verify no migrations remain pending" step to report up to date, since nothing is pending. |
| 2 | Confirm all three secrets — `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID`, `SUPABASE_DB_PASSWORD` — are configured in repository settings. | The job now **fails** if any is missing. If one is absent, the next `main` push goes red. That is the intended behaviour, but it should not be a surprise. |
| 3 | *(Optional)* Run the `pg_proc` query in §2 to convert the function inference into a direct observation. | Closes the one stated gap in this audit. |
| 4 | *(Follow-up, not B14-A)* Correct the four stale statements in §7. | Those documents currently describe a production state that is not real. |

### Not done, and deliberately

Per B14-A's stated exclusions: no migration was applied; no GitHub Environment approval gate was added; no `supabase db diff` PR comment step; no deploy ordering against Vercel. Those are I-16-B2/B3/B4 and remain unscheduled.

---

*B14-A complete. No further batch started.*
