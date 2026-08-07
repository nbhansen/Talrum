import { execSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';

import { sentryVitePlugin } from '@sentry/vite-plugin';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

import pkg from './package.json' with { type: 'json' };

// The package version is never bumped, so both the Settings readout and the
// persisted-cache buster identify a build by commit (#356). That makes the
// fallback load-bearing: a deployed build stuck on the constant 'dev' has the
// constant buster #356 was about, so a CI build without git must fail loudly.
const commitSha = ((): string => {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch (err) {
    if (process.env.CI) {
      throw new Error(
        'Cannot read the commit sha, which is the persisted-cache buster (#356). ' +
          'A CI build without git history would ship a cache that never invalidates.',
        { cause: err },
      );
    }
    return 'dev';
  }
})();

// Emit, upload and delete source maps on one flag: any path that emits maps
// must also upload and delete them, or CF Pages publishes the unminified
// bundles as `.map` siblings.
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
 * Compare the parsed hostname, not a substring: `notlocalhost.example.com`
 * contains "localhost" and must not read as safe. Anything unparseable counts
 * as not-local, so a malformed URL warns rather than reassures.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const isLocalSupabase = (raw: string): boolean => {
  try {
    return LOCAL_HOSTS.has(new URL(raw).hostname);
  } catch {
    return false;
  }
};

/**
 * Env files are invisible once written and Vite prefers `.env.local`, so a
 * forgotten file is all it takes for a "local" session to write to production.
 * Printing the target on every boot is the cheap structural guard.
 */
const supabaseTargetBanner = (): Plugin => ({
  name: 'talrum-supabase-target-banner',
  apply: 'serve',
  configResolved(config) {
    const url = String(config.env.VITE_SUPABASE_URL ?? '(unset)');
    // warn, not info, for the non-local case: it routes through Vite's warning
    // channel so it is coloured and survives log filtering.
    if (isLocalSupabase(url)) {
      config.logger.info(`\n  Supabase → ${url}  (local)\n`);
    } else {
      config.logger.warn(
        `\n  ⚠  Supabase → ${url}\n  ⚠  NOT LOCAL. Writes hit a real project with real data.\n`,
      );
    }
  },
});

export default defineConfig({
  plugins: [
    supabaseTargetBanner(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // We register the worker ourselves. The script this plugin injects was a
      // bare register() with no .catch(), so a browser that blocks service
      // workers raised an unhandled rejection Sentry reported as a crash
      // (#375, src/lib/platform/serviceWorker.ts).
      injectRegister: false,
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
        // CacheFirst keeps photo bytes on disk so kid mode works in the car:
        // offline, `signedUrlFor` returns the last URL it persisted, which is
        // the key already in this cache. Every clause below is load-bearing —
        // see #355 and scripts/verify-sw-routes.mjs.
        runtimeCaching: [
          {
            // Anchored to the start of the URL: Workbox applies a RegExp route
            // to a cross-origin request only when the match begins at index 0,
            // and Supabase Storage is always cross-origin. The mid-URL pattern
            // this replaces never fired, so the cache was never created.
            urlPattern: /^https?:\/\/[^/]+\/storage\/v1\/object\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'talrum-storage-v1',
              // No `matchOptions: { ignoreSearch: true }`: it would collapse
              // rotating signed URLs onto one entry, but ExpirationPlugin keys
              // on the request URL while the cache keys on the token, so LRU
              // deletes bytes still in use.
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 30 * 24 * 60 * 60,
              },
              // 200 only, never 0. An opaque response costs ~6 MB of quota
              // whatever its real size, and its status is unreadable, so a 403
              // on an expired token would cache as if it were the photo. The
              // pictogram <img> sets crossOrigin, so these are real CORS 200s.
              cacheableResponse: { statuses: [200] },
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
