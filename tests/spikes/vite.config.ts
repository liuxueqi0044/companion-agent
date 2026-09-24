import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  root: import.meta.dirname,
  plugins: [vue()],
  server: { host: '127.0.0.1', strictPort: true },
  build: { outDir: 'dist', emptyOutDir: false, rollupOptions: { input: 'ui-preview.html' } },
})
