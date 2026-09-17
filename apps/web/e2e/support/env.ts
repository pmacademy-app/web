/**
 * Shared environment resolution and safety rails for the B14-C critical-path specs.
 *
 * ## Why a production guard exists
 *
 * The B14-C spec is explicit: *"E2E must run against staging, never production."* The
 * signup flow creates a real account, completes a real lesson and awards real XP. Run
 * against production, that is not a test — it is unreviewed writes to live learner data,
 * from CI, by a robot.
 *
 * `PLAYWRIGHT_TEST_BASE_URL` is an environment variable, and environment variables get
 * copied between projects. So the guard is not "remember not to do that" — it is a
 * refusal in code, checked before any spec that writes.
 *
 * ## Why the specs skip instead of failing without credentials
 *
 * These flows need a real Supabase project, a real mailbox and real XP tables. A PR from
 * a fork, or a local `npm run test:e2e`, has none of those. Failing there would train
 * everyone to ignore a red E2E job, which is worse than not running it — so the specs
 * declare what they need and skip with a stated reason when it is absent. CI supplies
 * the secrets on the branches that matter, and there the same specs run for real.
 */

import { test } from '@playwright/test'

/** Hosts these specs must never write to, whatever the environment says. */
const PRODUCTION_HOSTS = ['prodily.adityagangwani.me']

export interface StagingCredentials {
  email: string
  password: string
}

/** The base URL Playwright was pointed at. */
export function baseUrl(): string {
  return process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000'
}

/**
 * Throws if the target looks like production.
 *
 * Matches on hostname rather than a substring of the URL, so a staging host that merely
 * contains the production name (`staging.prodily.adityagangwani.me` would, as a
 * substring) is judged on what it actually is. An unparseable URL is treated as unsafe:
 * a guard that cannot tell where it is pointing has not cleared anything.
 */
export function assertNotProduction(): void {
  let host: string
  try {
    host = new URL(baseUrl()).hostname.toLowerCase()
  } catch {
    throw new Error(
      `[e2e] PLAYWRIGHT_TEST_BASE_URL is not a valid URL (${baseUrl()}). ` +
        'Refusing to run a write-heavy spec against an unidentifiable target.'
    )
  }

  if (PRODUCTION_HOSTS.includes(host)) {
    throw new Error(
      `[e2e] Refusing to run against production (${host}). ` +
        'These specs create accounts and award XP. Point PLAYWRIGHT_TEST_BASE_URL at staging.'
    )
  }
}

/**
 * Staging credentials for an existing learner, or `null` when not configured.
 *
 * Read from the environment and never checked in. The account is expected to already
 * exist and be verified — the session spec logs in, it does not sign up.
 */
export function stagingCredentials(): StagingCredentials | null {
  const email = process.env.E2E_USER_EMAIL
  const password = process.env.E2E_USER_PASSWORD
  if (!email || !password) return null
  return { email, password }
}

/** True when the suite is configured to run flows that write to the database. */
export function canRunWriteFlows(): boolean {
  return process.env.E2E_ALLOW_WRITES === 'true'
}

/**
 * Skips the current spec unless staging credentials are present.
 *
 * `test.skip()` with a reason rather than a silent early return, so the report says
 * *why* a flow did not run. A skipped critical-path test that looks like a pass is how
 * coverage quietly disappears.
 */
export function requireStagingCredentials(): StagingCredentials {
  const credentials = stagingCredentials()
  test.skip(
    credentials === null,
    'E2E_USER_EMAIL / E2E_USER_PASSWORD not set — staging credentials required for this flow.'
  )
  assertNotProduction()
  return credentials as StagingCredentials
}

/** Skips unless the suite is explicitly allowed to create data. */
export function requireWriteFlows(): void {
  test.skip(
    !canRunWriteFlows(),
    'E2E_ALLOW_WRITES is not "true" — this flow creates an account and awards XP.'
  )
  assertNotProduction()
}

/**
 * A unique, obviously-synthetic address for a signup run.
 *
 * The `e2e+` prefix and the timestamp make the account identifiable and sortable in the
 * users table, so a staging clean-up can find them without guessing. Collisions across
 * parallel workers are avoided by the random suffix rather than by the clock alone.
 */
export function generateTestEmail(): string {
  const domain = process.env.E2E_SIGNUP_EMAIL_DOMAIN || 'example.com'
  const stamp = Date.now()
  const suffix = Math.random().toString(36).slice(2, 8)
  return `e2e+${stamp}-${suffix}@${domain}`
}

/** The session cookies B13-A made the only session store. */
export const SESSION_COOKIES = ['sb-access-token', 'sb-refresh-token'] as const
