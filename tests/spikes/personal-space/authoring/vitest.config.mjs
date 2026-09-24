import { defineConfig } from 'vitest/config'
export default defineConfig({ test:{ include:['tests/spikes/personal-space/authoring/**/*.test.{ts,mjs}'], environment:'node' } })
