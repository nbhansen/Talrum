import { execSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';

import { sentryVitePlugin } from '@sentry/vite-plugin';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

import pkg from './package.json' with { type: 'json' };

// Emit + upload + delete source maps in one flag, gated on the Sentry auth
// token. Any path that emits maps must upload-and-delete them — otherwise
// CF Pages publishes the unminified bundles as `.map` siblings.
// package.json's version is never bumped (the app deploys continuously from
// main), so the Settings "About" readout identifies builds by commit instead.
const commitSha = ((): string => {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'dev';
  }
})();

const sentryEnabled = Boolean(process.env.SENTRY_AUTH_TOKEN);
const sentryPlugins = sentryEnabled
  ? [
      sentryVitePlugin({
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        authToken: process.env.SENTRY_AUTH_TOKEN,
        release: { name: pkg.version },
        sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
      }),
    ]
  : [];

/**
 * Announce which Supabase project the dev server is pointed at. Env files are
 * invisible once written, and Vite prefers `.env.local` over `.env`, so a
 * forgotten file is all it takes for a "local" session to write to production.
 * Printing the target on every boot is the cheap structural guard; `npm run dev`
 * is local by construction and only `dev:cloud` loads Cloud credentials.
 */
const supabaseTargetBanner = (): Plugin => ({
  name: 'talrum-supabase-target-banner',
  apply: 'serve',
  configResolved(config) {
    const url = String(config.env.VITE_SUPABASE_URL ?? '(unset)');
    const isLocal = url.includes('127.0.0.1') || url.includes('localhost');
    config.logger.info(
      isLocal
        ? `\n  Supabase → ${url}  (local)\n`
        : `\n  ⚠  Supabase → ${url}\n  ⚠  NOT LOCAL. Writes hit a real project with real data.\n`,
    );
  },
});

export default defineConfig({
  plugins: [
    supabaseTargetBanner(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'Talrum',
        short_name: 'Talrum',
        description: 'A low-stim AAC board for non-verbal kids and their caregivers.',
        theme_color: '#f9f6f1',
        background_color: '#f9f6f1',
        display: 'standalone',
        orientation: 'landscape',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,ico,jpg}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        // Workbox emits sw.js.map + workbox-*.js.map in its closeBundle hook,
        // which runs AFTER Sentry's filesToDeleteAfterUpload glob. Without
        // this flag those maps would survive to CF Pages even with Sentry
        // enabled, leaking unminified SW glue.
        sourcemap: false,
        // Every new deploy: install → skip "waiting" → claim open tabs → next
        // navigation serves the fresh bundle. Without these, users sit on a
        // stale precache until they manually click "Reload" or close every tab.
        skipWaiting: true,
        clientsClaim: true,
        // CacheFirst keeps photo/audio bytes on disk so kid-mode in the car
        // works even after the signed-URL token has expired. URL persistence
        // (step 4) ensures we re-issue the same URL across reloads so the
        // cache key stays stable.
        runtimeCaching: [
          {
            urlPattern: /\/storage\/v1\/object\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'talrum-storage-v1',
              // Strip the ?token=... query so hourly-rotating signed URLs all
              // resolve to the same cache entry. Without this, the 200-entry
              // cap fills with rotation-duplicates of the same storage path
              // instead of 200 distinct paths.
              matchOptions: { ignoreSearch: true },
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 30 * 24 * 60 * 60,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        // Off in dev: SW + HMR fight each other and the precache turns into noise.
        enabled: false,
      },
    }),
    ...sentryPlugins,
  ],
  // Both pinned to 5173 because supabase/config.toml hardcodes that origin in the
  // auth redirect allow-list. Without strictPort, Vite silently moves to 5174 when
  // 5173 is busy and every sign-in link then fails the allow-list check. Failing to
  // boot is the better error.
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
  build: {
    sourcemap: sentryEnabled,
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(commitSha),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    css: true,
    // supabase/functions/** is Deno code with its own deno.json import map
    // (jsr: specifiers, std/assert). Vitest's default include picks it up
    // and fails to resolve the imports. Run those tests via
    // `npm run test:functions` instead.
    exclude: ['node_modules/**', 'dist/**', 'supabase/functions/**'],
    coverage: {
      provider: 'v8',
      // Explicit include so files no test ever imports still count — without
      // it Vitest 4 only reports files loaded during the run.
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/types/**', // generated + type-only
        'src/**/*.test.{ts,tsx}',
        'src/**/*.test-utils.tsx',
      ],
      reporter: ['text-summary'],
      // Ratchet floors, not targets: raise them when coverage rises, never
      // lower them to make a PR pass.
      thresholds: {
        lines: 87,
        statements: 84,
        functions: 77,
        branches: 78,
      },
    },
  },
});
