import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { include: ['tests/spikes/personal-space/host/**/*.test.ts'],
  environment:'node', passWithNoTests:false } })
