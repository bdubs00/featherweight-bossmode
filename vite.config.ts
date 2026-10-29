import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

// The page lives at /bossmode on the workbench. In development, Vite serves
// the page and sends /v1 and /ui to the fake server, or to the workbench
// that FW_URL names.
const target = process.env.FW_URL || 'http://127.0.0.1:8787';

/**
 * buildMark writes the build of the page into the head of index.html, as
 * <meta name="bossmode-build" content="<build>">. The build is a hash of the
 * rest of index.html, which names each file of the build by its hash, so a
 * new build has a new one. The front names the build that it serves on the
 * stream, and the page offers a reload when the two differ
 * (src/lib/build.ts). Development has no build, so the page offers nothing.
 */
function buildMark(): Plugin {
  return {
    name: 'bossmode-build',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const build = createHash('sha256').update(html).digest('hex').slice(0, 16);
        return [{ tag: 'meta', attrs: { name: 'bossmode-build', content: build }, injectTo: 'head' }];
      },
    },
  };
}

export default defineConfig({
  base: '/bossmode/',
  plugins: [buildMark()],
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
    // tokens.test.ts and scroll.test.ts read the styles as text, so the tests process those files.
    css: { include: [/(tokens|shell|fleet|cf|channel)\.css/] },
  },
});
