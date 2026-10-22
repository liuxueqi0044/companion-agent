import { defineConfig } from 'astro/config';
export default defineConfig({ output: 'static', devToolbar: { enabled: false }, vite: { build: { chunkSizeWarningLimit: 750 } } });
