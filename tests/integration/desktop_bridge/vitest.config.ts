import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: [
      'tests/integration/desktop_bridge/host.test.ts',
      'tests/integration/desktop_bridge/lifecycle.test.ts',
      'tests/integration/desktop_bridge/client.test.ts',
      'tests/integration/desktop_bridge/watch_lifecycle.test.ts',
      'tests/integration/desktop_bridge/action_isolation.test.ts',
      'tests/integration/desktop_bridge/e2e.test.ts',
    ],
    exclude: ['**/node_modules/**', '**/dist/**', '**/reports/**', '**/reviews/**'],
    testTimeout: 15_000,
    hookTimeout: 15_000,
    pool: 'forks',
    maxWorkers: 1,
  },
})
