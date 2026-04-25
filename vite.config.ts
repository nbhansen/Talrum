import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'Talrum',
        short_name: 'Talrum',
        description: 'A low-stim AAC board for non-verbal kids and their caregivers.',
        theme_color: 'oklch(97.5% 0.008 85)',
        background_color: 'oklch(97.5% 0.008 85)',
        display: 'standalone',
        orientation: 'landscape',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,ico}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
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
  ],
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
  },
});
