import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['lib/__tests__/**/*.test.ts'],
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
