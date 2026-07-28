# PM Academy — Supabase CLI Migration Guide

**Status:** Living document — operational runbook for the database migration workflow. Not a decision doc: `Architecture.md` §2/§9 own the actual schema and RLS requirements; this doc owns *how* to change them safely.
**Companion docs:** `Architecture.md` §2 (data model), §8 (deployment pipeline — this guide implements the database half of it), §9 (security/RLS). `Rules.md` §7 (change management — this doc's own Changelog below follows that rule).

This document defines the version-controlled database workflow for PM Academy. To prevent schema drift, data loss, and deployment issues, **never run manual DDL SQL commands in the Supabase Dashboard SQL Editor**. All database schema modifications must be implemented via Supabase CLI migration scripts.

---

## 1. Prerequisites & CLI Installation

The Supabase CLI is already integrated into the workspace dependencies. You can run it on-demand using `npx`.

To verify the installation:
```bash
npx supabase --version
```

---

## 2. Initial Setup: Linking Your Project

Before running local development or pushing database migrations, link this repository to your remote Supabase project:

1. Retrieve your **Project Reference ID** from the Supabase Dashboard URL (e.g., `https://supabase.com/dashboard/project/abcde12345` -> `abcde12345`).
2. Run the link command at the project root:
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref-id>
   ```
3. Enter your database password when prompted. This creates config links locally in `.supabase/` (which is git-ignored).

---

## 3. Database Migration Workflows

### 3.1 Creating a New Migration
When making a database change (e.g., adding a table, index, or modification to a trigger):
1. Generate a new timestamped migration file:
   ```bash
   npx supabase migration new add_my_new_table
   ```
2. Open the newly generated file under `supabase/migrations/<timestamp>_add_my_new_table.sql`.
3. Add your SQL statements (ensure they are idempotent and secure).

**⚠ Non-negotiable: if the migration creates or alters a table holding user data, `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` and the relevant policies must ship in the *same* migration file, not a follow-up one.** Per `Architecture.md` §9, every user-state table is RLS-protected by design — a migration that creates a table without RLS is not a "do it later" gap, it's a real security hole the moment `db push` runs against production, even if only for the minutes until a follow-up migration lands.

### 3.2 Testing Migrations Locally
To test migrations locally without touching the production database:
1. Start local Supabase containers (requires Docker to be running):
   ```bash
   npx supabase start
   ```
2. Reset the database to apply all migrations in order:
   ```bash
   npx supabase db reset
   ```
3. Verify the schema, RLS policies, and triggers are loaded correctly in the local studio (typically runs at `http://localhost:54323`).

### 3.3 Deploying Migrations to Production
Production deployments are automated via GitHub Actions on push/merge events. 

To deploy migrations **manually** from your local command line:
```bash
npx supabase db push --password "<your-database-password>"
```

---

## 4. Rollback & recovery Procedures

### 4.1 Local Rollback
If a migration fails locally, modify the migration file or run reset to restore the schema:
```bash
npx supabase db reset
```

### 4.2 Production Rollback
If a database change is pushed to production and needs to be undone:
1. **Never write a manual delete query.** Create a new roll-forward migration script that explicitly drops/modifies the table or function:
   ```bash
   npx supabase migration new revert_my_last_table
   ```
2. Add the undo commands (e.g., `DROP TABLE my_new_table;`).
3. Commit and push this change to `main` so the deployment pipeline runs it.

### 4.3 Production Baselining & Repair Operations
**This section exists to reconcile the past, not to create an ongoing exception to the "never manual DDL" rule above.** If early prototyping (e.g., the Phase 0 waitlist table) created tables directly in the Dashboard before this CLI workflow was adopted, use the one-time procedure below to bring them under migration control — then the "never manual DDL" rule applies with no exceptions going forward.

When migrating an existing database that already contains active tables (e.g. from Phase 0 pre-launch waitlist setup), running `npx supabase db push` for the first time will fail because the CLI will attempt to recreate pre-existing tables, indexes, or policies.

To resolve this without data loss, mark the initial migrations as already applied in your remote database's migration history:
1. Link your project locally:
   ```bash
   npx supabase link --project-ref <project-id>
   ```
2. Record the base migrations as already applied in the remote history table:
   ```bash
   npx supabase migration repair --status applied 20260728000001
   npx supabase migration repair --status applied 20260728000002
   ```
3. Future runs of the deployment pipeline will now skip these two files and apply only newly created migrations.

---

## 5. CI/CD Integration & GitHub Secrets

Automated schema updates are executed via the [`.github/workflows/supabase-deploy.yml`](../.github/workflows/supabase-deploy.yml) pipeline.

To authorize the workflow, you must set up three secrets in your GitHub Repository under **Settings → Secrets and variables → Actions**:

| Secret Name | Description | Where to find it |
|-------------|-------------|------------------|
| `SUPABASE_ACCESS_TOKEN` | Personal Access Token for account API access | Supabase Dashboard → Access Tokens |
| `SUPABASE_PROJECT_ID` | Reference string of the remote project | Project Settings → General |
| `SUPABASE_DB_PASSWORD` | Password used during project creation | User-defined at project setup |

---

## Changelog

- v1.1 — Documentation review fixes: added standard header block (previously the only doc in the set without one), fixed a leaked local Windows absolute file path (`file:///d:/PM Academy/...`) in §5 to a relative repo path, added an explicit RLS-in-same-migration requirement to §3.1 (`Architecture.md` §9 makes RLS non-negotiable on every user-data table — this is where that rule actually gets enforced in practice), clarified §4.3 as a one-time reconciliation path rather than an ongoing exception to the no-manual-DDL rule, and added this Changelog per `Rules.md` §7's own requirement that every document in this set carries one.
- v1.0 — Initial migration guide authored to formalize the Supabase CLI-based schema workflow (linking, migrations, local testing, production deploy, rollback, and CI/CD secrets).
