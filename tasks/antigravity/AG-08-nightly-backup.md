# AG-08: Nightly encrypted database dump and a restore drill

- **IDs closed:** plan PR-16 part 2 (ENG-07)
- **Milestone:** M1 Platform safety
- **Depends on:** AG-07 (release order and Vercel secrets settled; pinned Supabase CLI from AG-03)
- **Size:** M
- **Parallel-safe:** yes (new workflow file only)
- **Needs owner sign-off:** yes. Where encrypted production data is stored, who holds the key, how long it is kept. Must stay free.

## Why
The free Supabase plan gives no downloadable backups. If data is lost, there is nothing to restore from. A dump nobody has restored is not a backup either.

## Current state (verified 2026-11-12)
- No workflow runs `supabase db dump` (`git grep -n -F -e 'db dump' -- .github/workflows` prints nothing).
- `deploy-supabase` already holds `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID`, `SUPABASE_DB_PASSWORD` (`.github/workflows/ci.yml:294-296`).
- `backups/` exists locally, is git-ignored (`.gitignore:45-48`) and holds owner data. It is not a backup system and must never be read or committed.

## Files in scope
- `.github/workflows/db-backup.yml` (new)
- `docs/DEPLOYMENT.md` (backup and restore section)
- `docs/ops/restore-drill.md` (new, short checklist the owner fills in)

## Out of scope
- Paid storage of any kind.
- Running a dump or restore yourself.
- `backups/`.

## Steps
1. Propose the storage option in your plan for owner sign-off. Free options to compare: a GitHub Actions artifact (retention up to 90 days, counts toward the free storage quota), a release asset in a separate private repository, or a free-tier object store the owner already has. Recommend one with numbers (expected dump size, quota).
2. Workflow `db-backup.yml`: `schedule` nightly (pick a quiet hour for India), plus `workflow_dispatch`. `permissions: contents: read`. Pinned `supabase/setup-cli`. Run `supabase db dump` for schema, data (`--data-only`) and roles into a temp dir, using the same three secrets at step level.
3. Encrypt before upload with `age` or `gpg --symmetric` (pinned, checksum-verified install like the gitleaks step in `ci.yml:254-265`). Key from a new secret `BACKUP_ENCRYPTION_KEY`. Fail if it is missing. Never upload plaintext.
4. Upload with the chosen option and a retention period. Name files with the UTC date.
5. Write `docs/ops/restore-drill.md`: download, decrypt, restore into a local Supabase (`supabase start`, `psql < dump`), check row counts of `users`, `user_lesson_progress`, `xp_events`, `capstone_submissions`. A table for the owner to record date, dump size, duration, result.
6. Add a "Backups" section to `docs/DEPLOYMENT.md` linking the drill.

## Owner steps (write them into your report)
- Approve the storage option and retention.
- Create `BACKUP_ENCRYPTION_KEY`, store a copy in a password manager. Losing it makes every dump useless.
- Run the workflow once by hand, then do the restore drill and fill in the table.

## Acceptance checks
- `git grep -n --untracked -e BACKUP_ENCRYPTION_KEY -e SUPABASE_DB_PASSWORD -- .github/workflows/db-backup.yml` hits are step-level only.
- `git grep -n --untracked -A5 -e upload -- .github/workflows/db-backup.yml` shows only encrypted files are uploaded.
- `git grep -n --untracked -e linked -e 'db push' -- .github/workflows/db-backup.yml` shows no `db push`.
- From `apps/web`: `npx vitest run lib/__tests__/complete-consent-page.test.ts` passes.
- Real proof: the owner's manual run is green and the drill table has one completed row.

## Safety
- Never run `git push`, any `supabase` command (including `db dump`), or anything against production yourself.
- Never read, list or copy `backups/` or `.env*` files.
- Do not edit `audit/`, `08-IMPLEMENTATION-PLAN.md` or `content/`.
- Do not start a dev server. Do not run the full `npm test` or `npm run build`.
- No em-dashes in comments or docs.

Start by producing an Implementation Plan artifact for review. Do not edit files until it is approved.
