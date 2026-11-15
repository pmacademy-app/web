# Database Backup Restore Drill (ENG-07 / AG-08)

This runbook guides the owner through verifying and testing database restoration from the nightly encrypted backups produced by `.github/workflows/db-backup.yml`.

A backup that has never been restored is not a reliable backup. Perform this drill upon initial backup workflow setup and periodically (e.g. quarterly or before major migrations).

---

## 1. Prerequisites

- Docker Desktop running locally.
- Pinned Supabase CLI available locally.
- GnuPG (`gpg`) installed on your workstation.
- The `BACKUP_ENCRYPTION_KEY` secret stored in your password manager.
- GitHub CLI (`gh`) or browser access to download the artifact from the repository Actions tab.

---

## 2. Step-by-Step Restore Procedure

### Step 2.1: Download and Decrypt the Backup

1. Download the latest `prodily-db-backup-<timestamp>` artifact from GitHub Actions:
   ```bash
   gh run download -n "prodily-db-backup-<timestamp>" -D ./backup_drill
   cd backup_drill
   ```
2. Decrypt the GPG archive using the encryption key:
   ```bash
   gpg --decrypt --batch --yes --passphrase "$BACKUP_ENCRYPTION_KEY" -o backup.tar.gz prodily_db_backup_*.tar.gz.gpg
   ```
3. Extract the SQL dump files:
   ```bash
   tar -xzf backup.tar.gz
   ls -la
   # Expected files: roles.sql, schema.sql, data.sql
   ```

---

### Step 2.2: Start a Fresh Isolated Local Database

Do NOT restore over your daily development database if it contains uncommitted test state.

1. In a clean terminal, start or reset local Supabase:
   ```bash
   supabase db reset
   ```
2. Or spin up a dedicated local postgres instance or test container.

---

### Step 2.3: Restore Roles, Schema, and Data

Apply the dumps in sequence:

```bash
# 1. Apply roles if required (optional if local container already has Supabase roles)
# psql -h localhost -p 54322 -U postgres -d postgres -f roles.sql

# 2. Apply schema
psql -h localhost -p 54322 -U postgres -d postgres -f schema.sql

# 3. Apply data
psql -h localhost -p 54322 -U postgres -d postgres -f data.sql
```

---

### Step 2.4: Verification and Row Count Integrity Checks

Run the verification query to confirm that core learner data and activity records restored accurately:

```sql
SELECT
  (SELECT count(*) FROM public.users) AS user_count,
  (SELECT count(*) FROM public.user_lesson_progress) AS progress_count,
  (SELECT count(*) FROM public.xp_events) AS xp_events_count,
  (SELECT count(*) FROM public.capstone_submissions) AS capstone_count;
```

Verify that counts match or closely track production metrics and that no fatal SQL errors occurred during data import.

---

## 3. Restore Drill Log

The owner records each executed restore drill in the table below:

| Drill Date (UTC) | Backup Timestamp | Archive Size | Decrypt & Restore Duration | Row Counts (Users / Progress / XP / Capstones) | Result (Pass / Fail) | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| YYYY-MM-DD | YYYYMMDD_HHMMSSZ | XX MB | X min | U: ... / P: ... / X: ... / C: ... | Pending initial drill | Awaiting initial manual trigger by owner |

