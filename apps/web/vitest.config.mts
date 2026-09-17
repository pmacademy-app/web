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
    testTimeout: 15000,
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
