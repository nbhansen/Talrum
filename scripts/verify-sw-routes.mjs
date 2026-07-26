// Post-build assertion: the Supabase Storage runtime cache in dist/sw.js is
// actually reachable, and stores responses it can read. See #355.
//
// Both invariants are invisible to the jsdom suite — no test in src/ ever runs
// a service worker — and both fail silently in production: the cache simply
// never appears, or fills with opaque responses at ~6 MB of storage quota each.
//
// Self-test: drop the leading `^https?://[^/]+` from the urlPattern in
// vite.config.ts and re-run `npm run build`. The build must fail with
// `pattern does not match a cross-origin storage URL at index 0`.
import { readFileSync } from 'node:fs';

const CACHE_NAME = 'talrum-storage-v1';
// A signed URL of the shape src/lib/storage.ts mints. The host is immaterial —
// what matters is that it is a different origin from the app, which every
// Supabase project is.
const SAMPLE_URL =
  'https://project.supabase.co/storage/v1/object/sign/pictogram-images/u/p.jpg?token=abc.def.ghi';

const sw = readFileSync('dist/sw.js', 'utf8');

const fail = (message) => {
  console.error(`Service worker route verification failed: ${message}`);
  console.error('\nOffline photos in kid mode depend on this route. See #355.');
  process.exit(1);
};

const nameAt = sw.indexOf(`"${CACHE_NAME}"`);
if (nameAt === -1) fail(`no runtime cache named ${CACHE_NAME} in dist/sw.js`);

// Minified shape: registerRoute(/…/i,new X.CacheFirst({cacheName:"…",…}),"GET")
// Walk back from the cache name to the registerRoute call that carries it.
const callAt = sw.lastIndexOf('registerRoute(', nameAt);
if (callAt === -1) fail(`${CACHE_NAME} is not registered through registerRoute`);

const head = sw.slice(callAt + 'registerRoute('.length, nameAt);
const literal = /^\s*(\/(?:\\.|\[(?:\\.|[^\]])*\]|[^/\\\n])+\/[a-z]*)\s*,/.exec(head);
if (!literal) fail(`could not read the urlPattern registered for ${CACHE_NAME}`);

const lastSlash = literal[1].lastIndexOf('/');
const pattern = new RegExp(literal[1].slice(1, lastSlash), literal[1].slice(lastSlash + 1));

// workbox-routing/RegExpRoute.ts: a RegExp route is applied to a cross-origin
// request only when the match starts at the first character of the URL.
const match = pattern.exec(SAMPLE_URL);
if (!match || match.index !== 0) {
  fail(
    `pattern does not match a cross-origin storage URL at index 0\n` +
      `  pattern: ${pattern}\n` +
      `  url:     ${SAMPLE_URL}\n` +
      `  result:  ${match ? `matched at index ${match.index}` : 'no match'}`,
  );
}

// Opaque responses (status 0) are unreadable and quota-padded; caching them is
// the bug this route had before it ever fired.
const options = sw.slice(nameAt, nameAt + 600);
const statuses = /statuses:\s*\[([^\]]*)\]/.exec(options);
if (!statuses) fail(`no cacheableResponse statuses found for ${CACHE_NAME}`);
if (
  statuses[1]
    .split(',')
    .map((s) => s.trim())
    .includes('0')
) {
  fail(`${CACHE_NAME} accepts opaque responses (status 0): statuses:[${statuses[1]}]`);
}

console.log('Service worker route verification passed.');
