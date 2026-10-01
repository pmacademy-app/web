import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    // B14-C: `node` stays the default on purpose.
    //
    // F-REL-10 was that this config made component tests structurally impossible — the
    // `include` pattern only matched `.test.ts` files under `lib/__tests__`, so a
    // `.tsx` test was never collected, let alone run. The fix is to widen `include`,
    // not to switch the default environment: the existing suites are server-side
    // (route handlers, services, contract assertions) and run under `node`. Flipping
    // the global default to `jsdom` would quietly change the globals all of them run
    // against, which is exactly the "existing suites unaffected" criterion this batch
    // has to satisfy.
    //
    // Component tests opt in per file with a `@vitest-environment jsdom` docblock, so
    // the environment choice sits next to the test that needs it and there is no second
    // config or workspace project to keep in sync.
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['lib/__tests__/**/*.test.ts', 'components/__tests__/**/*.test.tsx'],
    exclude: ['e2e/**/*', 'node_modules/**/*'],
    // CI stability (F-REL-11). The suite is large (190+ files) and several hot paths
    // — notably the notification queue (`enqueueNotificationItem` → dynamic
    // `import('@/lib/admin/settings-service')`, `@/lib/monitoring/logger`) — defer
    // heavy module graphs behind the first `await import(...)`. That import cost is
    // paid lazily *inside* the running test, so it counts against the per-test clock.
    //
    // Under the forks pool on a shared CI runner, too many workers transforming and
    // importing in parallel starve each other's event loops; a test that completes in
    // <1s locally then blows past a tight timeout waiting for CPU to finish a
    // first-time import (and, more rarely, a new worker cannot even spawn within the
    // pool's start window). Both symptoms are contention, not test-logic bugs — every
    // test passes in isolation and the full suite is green when it completes.
    //
    // Two levers fix the class rather than the two tests that happened to lose the
    // race this run: cap fork concurrency so workers are not oversubscribed, and give
    // each test/hook enough headroom that a starved first-time import still finishes.
    // A genuine hang is still caught — 30s is comfortably longer than any real test
    // here (the slowest do sub-second work) yet short enough to fail fast on a true
    // deadlock.
    //
    // Vitest 4 reworked the pool API: the old `poolOptions.forks.{minForks,maxForks}`
    // block was removed (it now logs a deprecation and is silently ignored), so the
    // concurrency cap has to live in the top-level `maxWorkers` option instead — that
    // is the Vitest 4 replacement for `maxForks`. `pool: 'forks'` is still valid (and
    // the default). Leaving the old block in place would mean the cap never applied
    // and only the timeout bump was holding the suite together.
    pool: 'forks',
    maxWorkers: 2,
    testTimeout: 30000,
    hookTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['lib/**/*.ts', 'app/**/*.ts', 'app/**/*.tsx'],
      exclude: ['**/*.d.ts', 'lib/__tests__/**'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './'),
      'framer-motion': path.resolve(import.meta.dirname, './node_modules/framer-motion/dist/cjs/index.js'),
    },
  },
})
