#!/usr/bin/env bash
set -euo pipefail

# Applies the held migrations listed in supabase/tests/held-migrations.txt
# against the local Supabase Postgres instance in CI (AG-04).

DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HELD_TXT="${REPO_ROOT}/supabase/tests/held-migrations.txt"
PENDING_DIR="${REPO_ROOT}/supabase/migrations/pending-approval"
VALIDATION_DIR="${PENDING_DIR}/validation"

if [ ! -f "${HELD_TXT}" ]; then
  echo "No held migrations file found at ${HELD_TXT}"
  exit 0
fi

echo "=== Applying held migrations from supabase/tests/held-migrations.txt ==="
while IFS= read -r migration || [ -n "${migration}" ]; do
  # Trim whitespace and skip comments or empty lines
  trimmed="$(echo "${migration}" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  [[ "${trimmed}" =~ ^# ]] && continue
  [[ -z "${trimmed}" ]] && continue

  sql_path="${PENDING_DIR}/${trimmed}"
  if [ ! -f "${sql_path}" ]; then
    echo "ERROR: migration file not found: ${sql_path}"
    exit 1
  fi

  echo "Applying held migration: ${trimmed}"
  psql "${DB_URL}" -v ON_ERROR_STOP=1 -f "${sql_path}"

  # Run companion validation file if it exists and is safe on an empty database
  val_name="${trimmed%.sql}_validation.sql"
  val_path="${VALIDATION_DIR}/${val_name}"
  if [ -f "${val_path}" ]; then
    # Skip validations that require pre-existing user rows or custom session parameters
    if [[ "${val_name}" == *"users_username_check"* ]] || [[ "${val_name}" == *"lock_public_users"* ]]; then
      echo "Skipping staging-only / user-dependent validation: ${val_name}"
    else
      echo "Running companion validation: ${val_name}"
      psql "${DB_URL}" -v ON_ERROR_STOP=1 -f "${val_path}"
    fi
  fi
done < "${HELD_TXT}"

echo "=== All listed held migrations applied successfully ==="

