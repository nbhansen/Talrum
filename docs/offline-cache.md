# The offline read cache: what survives a reload

Kid mode must work in the car: reload the app with no network and the last
board, its pictograms, and their photos all still render. That
means server data persists to disk — and persisted data on a shared iPad is
a security surface. The load-bearing invariant of this page: **everything
per-user on disk is wiped at every auth boundary.** If user A signs out and
user B signs in, B must never see A's boards, A's queued edits, or A's
signed storage URLs. `clearPersistedCache()` in `src/lib/queryClient.ts` is
the single function that enforces this; everything else here explains what
it protects.

## Three caches

Talrum keeps three distinct offline stores. Newcomers conflate them; don't.

1. **The React Query data cache** (this page) — server _reads_ (boards,
   pictograms, profiles), dehydrated to IndexedDB under the
   `talrum-react-query` key so a cold boot offline still has data.
2. **The outbox write queue** (`docs/outbox.md`) — pending _writes_, one
   IndexedDB key per entry (`outbox:{ulid}`), replayed when the network
   returns. The read cache shows what the server said; the outbox holds what
   the server hasn't heard yet.
3. **The service-worker asset cache** (`vite.config.ts`) — the app shell
   precache plus a capped `CacheFirst` runtime cache (`talrum-storage-v1`)
   for Supabase Storage photo bytes. It stores _bytes by URL_; the data
   cache stores _rows by query key_.

A fourth, smaller stripe rides alongside: `src/lib/storage/storage.ts` persists
minted signed URLs to IndexedDB under `signed-url:` keys, so a reload
re-issues the same URL and the SW cache key stays stable.

That fourth stripe is what makes the third one work offline, and the two
are easy to mistake for redundant. A signed URL carries a `?token=` that
rotates hourly, and the SW cache keys include it — deliberately, see the
`matchOptions` note in vite.config.ts. Offline the app never mints:
`signedUrlFor` fails to re-mint and returns the last URL it persisted.
When that URL also served the last successful load — the common case — it
reproduces the exact cache key and the bytes come back, expired token and
all. The two stripes can desync: a mint that succeeds right before a load
that fails strands the bytes under the previous key for up to an hour
(see [storage.md](./storage.md)). The cost is a placeholder or the TTS
fallback, never an error. That is the whole mechanism behind "kid mode
works in the car".

Two things about this cache are easy to break and impossible to see from a
test (#355), so both are asserted at build time by
`scripts/verify-sw-routes.mjs`:

- Its route pattern must match from the **start** of the URL. Workbox
  applies a RegExp route to a cross-origin request only when the match
  begins at index 0, and Supabase Storage is always cross-origin. An
  unanchored pattern doesn't warn — the cache simply never gets created.
- It must not cache opaque responses (`statuses: [0, …]`). A no-cors
  `<img>` load produces one, and the browser charges it several megabytes
  of storage quota no matter how small the photo is — a cache full of them
  blows the origin quota, and blowing the quota evicts _everything_ here,
  including the outbox. `PictogramMedia` sets `crossOrigin="anonymous"` so
  these are real, readable, actual-size CORS responses.

Parent voice recordings land in this cache too (#378). A media element
always requests audio with a `Range` header, Supabase answers `206 Partial
Content`, and `cache.put` rejects a 206 outright — so `playPictogramAudio`
fetches the clip itself (a plain CORS 200 the route can store) and plays
the bytes through a blob object URL. When the fetch fails and the cache has
no copy, `speakPictogram` falls back to TTS. Recordings share the photos'
`maxEntries: 200` LRU budget, so a pictogram with both a photo and a
recording takes two entries plus hourly rotation duplicates — revisiting
the cap before libraries grow is tracked in #266.

## The persister

`src/lib/queryClient.ts` builds the whole thing: the `queryClient` with its
calm global defaults (see [queries.md](./queries.md)), an
`createAsyncStoragePersister` wrapping `idb-keyval` with a short throttle
so rapid mutations coalesce into one IDB write, and the `persistOptions`
that feed `PersistQueryClientProvider` in `src/app/App.tsx`, which hydrates
the cache from IDB before the app renders queries.

## What gets dehydrated — and what deliberately isn't

`shouldDehydrateQuery` persists only queries with `status === 'success'`
and defined data. Pending and errored queries are skipped on purpose: a
dehydrated pending query would replay as `success` with `undefined` data on
the next boot, and components would render against a value that never
existed. Disabled queries fall out the same way. So the persisted snapshot
is exactly "the last thing the server actually said", nothing speculative.

## The buster: one cache per build

`persistOptions.buster` is `__APP_COMMIT__` — Vite replaces it at build
time with the short commit sha (see `vite.config.ts` `define` and
`src/types/globals.d.ts`). A persisted cache written by any other build is
discarded on hydration rather than restored. So every deploy starts each
device from the server, and no stale-shaped data can leak into new code:
rename a column or reshape a query result and the old snapshot is simply
gone.

It was `__APP_VERSION__` — package.json's version — until #356. That reads
like the more disciplined choice, and it was the wrong one: this repo
deploys continuously from main and never bumps the version, so the buster
was the constant `0.1.0` and the escape hatch could not fire. `#302` added
the commit readout in Settings for exactly that reason.

Invalidating per deploy over-invalidates, deliberately. A device only ever
sees a new buster by having just downloaded the build that carries it, so
it is online at that moment: the cost is one refetch, re-persisted almost
immediately. The opposite error costs a screen rendering against data of a
shape it no longer understands, on a device you are not holding, with no
reload that clears it. That asymmetry is the whole argument.

`maxAge` is now the belt rather than the mechanism — it only matters for a
tablet that sat in a drawer across no deploys at all.

## Auth boundaries: the scrub

`src/app/AuthGate.tsx` is the sole subscriber to Supabase auth. Its
`onAuthStateChange` handler calls `clearPersistedCache()` on `SIGNED_OUT`
_and_ on a same-tab account switch — a `SIGNED_IN` carrying a different
`user.id` without an intervening `SIGNED_OUT` (#179). Token refreshes
(same id) and the very first sign-in (no prior id) are not boundaries and
skip the scrub.

The scrub wipes every per-user stripe, not just the query cache:

- The React Query cache — in-memory (`queryClient.clear()`) and persisted
  (`persister.removeClient()`). Without this, user B boots straight into
  user A's hydrated boards before a single network request fires.
- All `outbox:` entries — writes A queued offline would otherwise replay
  under B's session. RLS blocks them server-side, but they'd surface as "N
  failed" in the indicator: confusing, and a small leak of A's intent.
- All `signed-url:` entries — they reference A's storage paths.
- The parent PIN hash (`clearPin`, #178) — otherwise B is locked out of kid
  mode by A's PIN.
- The last-board pointer (`clearLastBoard`, #178) — otherwise B's
  auto-launch lands on A's board UUID, which 404s under RLS.
- The SW storage cache (#380) — A's photo and recording bytes, keyed by
  signed URL. Deleted by prefix (`talrum-storage`) rather than the literal
  name in vite.config.ts, so a future `-v2` bump cannot orphan the old
  cache — Workbox's `cleanupOutdatedCaches` covers only the precache. The
  precache itself (`workbox-precache-*`) is not per-user and stays.
- Workbox's expiration index (#380) — the `workbox-expiration` IDB
  database, one row per cached entry holding the full signed URL. The
  delete can settle late (the SW holds an open connection until the
  browser stops it), which is fine: the rows are unaddressable meanwhile,
  and a late delete self-heals because every cache hit re-stamps its row.

The localStorage clears are synchronous; the IDB and Cache Storage deletes
race the next sign-in's hydration, which is fine because every operation is
idempotent.

## Known limits

- The scrub is per-tab-triggered but the stores are per-origin; a second
  tab signed in as A while this tab switches to B is out of scope (Supabase
  auth broadcasts the sign-out across tabs anyway).
