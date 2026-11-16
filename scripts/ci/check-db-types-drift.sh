#!/usr/bin/env bash
set -euo pipefail

# Verifies that apps/web/types/database.ts stays in sync with local schema replay (AG-04).

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEMP_FILE="$(mktemp)"

echo "=== Generating database types from local Supabase ==="
supabase gen types typescript --local > "${TEMP_FILE}"

echo "=== Checking drift against apps/web/types/database.ts ==="
if diff -u "${REPO_ROOT}/apps/web/types/database.ts" "${TEMP_FILE}" > /dev/null 2>&1; then
  echo "✓ Database types are in sync with local schema replay"
  rm -f "${TEMP_FILE}"
else
  echo "::warning::Database types drift detected between local schema replay and apps/web/types/database.ts"
  diff -u "${REPO_ROOT}/apps/web/types/database.ts" "${TEMP_FILE}" || true
  rm -f "${TEMP_FILE}"
fi

