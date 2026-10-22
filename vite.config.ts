import { defineConfig } from 'vitest/config';

// The page lives at /bossmode on the workbench. In development, Vite serves
// the page and sends /v1 and /ui to the fake server, or to the workbench
// that FW_URL names.
const target = process.env.FW_URL || 'http://127.0.0.1:8787';

export default defineConfig({
  base: '/bossmode/',
  esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  build: {
    outDir: 'dist',
    // The page loads no asset as a data URI and no script inline, so the
    // content security policy of /bossmode can stay strict.
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false },
  },
  server: {
    port: 5173,
    proxy: {
      '/v1': { target, changeOrigin: true },
      '/ui': { target, changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
