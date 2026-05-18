import { fileURLToPath, URL } from 'node:url';

import { sentryVitePlugin } from '@sentry/vite-plugin';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

import pkg from './package.json' with { type: 'json' };

// Emit + upload + delete source maps in one flag, gated on the Sentry auth
// token. Any path that emits maps must upload-and-delete them — otherwise
// CF Pages publishes the unminified bundles as `.map` siblings.
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

export default defineConfig({
  plugins: [
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
  build: {
    sourcemap: sentryEnabled,
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
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
  },
});
