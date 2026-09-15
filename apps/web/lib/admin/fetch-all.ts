/**
 * Historical import path for the shared pagination helper.
 *
 * The helper never had admin-specific behaviour — it lived here because the
 * Achievements and Moderation services needed it first. B8-F moved the
 * implementation to `lib/db/pagination.ts`, which is where a bounded-query
 * primitive belongs now that there is a data layer to own it.
 *
 * This file stays as a re-export so the eight existing call sites keep working;
 * new code should import from `@/lib/db`.
 */
export { fetchAllRows, POSTGREST_PAGE_SIZE, type PageResult } from '@/lib/db/pagination'
