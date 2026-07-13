# The offline read cache: what survives a reload

Kid mode must work in the car: reload the app with no network and the last
board, its pictograms, and their photos and audio all still render. That
means server data persists to disk — and persisted data on a shared iPad is
a security surface. The load-bearing invariant of this page: **everything
per-user on disk is wiped at every auth boundary.** If user A signs out and
user B signs in, B must never see A's boards, A's queued edits, or A's
signed storage URLs. `clearPersistedCache()` in `src/lib/queryClient.ts` is
the single function that enforces this; everything else here explains what
it protects.

## Three caches

Talrum keeps three distinct offline stores. Newcomers conflate them; don't.

1. **The React Query data cache** (this page) — server *reads* (boards,
   pictograms, profiles), dehydrated to IndexedDB under the
   `talrum-react-query` key so a cold boot offline still has data.
2. **The outbox write queue** (`docs/outbox.md`) — pending *writes*, one
   IndexedDB key per entry (`outbox:{ulid}`), replayed when the network
   returns. The read cache shows what the server said; the outbox holds what
   the server hasn't heard yet.
3. **The service-worker asset cache** (`vite.config.ts`) — the app shell
   precache plus a `CacheFirst` runtime cache (`talrum-storage-v1`) for
   Supabase Storage bytes: photos and audio, capped at 200 entries / 30
   days, with `ignoreSearch` so hourly-rotating signed-URL tokens hit the
   same entry. It stores *bytes by URL*; the data cache stores *rows by
   query key*.

A fourth, smaller stripe rides alongside: `src/lib/storage.ts` persists
minted signed URLs to IndexedDB under `signed-url:` keys, so a reload
re-issues the same URL and the SW cache key stays stable.

## The persister

`src/lib/queryClient.ts` builds the whole thing:

- `queryClient` sets the global defaults: `staleTime: 30_000` (a mutation
  followed by an immediate re-read hits cache), `refetchOnWindowFocus:
  false` (AAC use is calm — an iPad tap away shouldn't churn), `retry: 1`.
- `createAsyncStoragePersister` wraps `idb-keyval` (`get`/`set`/`del`) as
  the async string store, with `throttleTime: 1_000` to coalesce rapid
  mutations into one IDB write.
- `persistOptions` feeds `PersistQueryClientProvider` in `src/app/App.tsx`,
  which hydrates the cache from IDB before the app renders queries.

## What gets dehydrated — and what deliberately isn't

`shouldDehydrateQuery` persists only queries with `status === 'success'`
and defined data. Pending and errored queries are skipped on purpose: a
dehydrated pending query would replay as `success` with `undefined` data on
the next boot, and components would render against a value that never
existed. Disabled queries fall out the same way. So the persisted snapshot
is exactly "the last thing the server actually said", nothing speculative.

## The buster: version-pinned invalidation

`persistOptions.buster` is `__APP_VERSION__` — Vite replaces it at build
time with the `package.json` version (see `vite.config.ts` `define` and
`src/types/globals.d.ts`). If the persisted cache was written by a
different app version, hydration discards it wholesale. This is the escape
hatch for domain-type changes: rename a column, reshape a query result,
bump the version, and no stale-shaped data can leak into the new code.
`maxAge` (one week) is the belt to that suspender — a tablet left in a
drawer doesn't resurrect month-old data.

## Auth boundaries: the scrub

`src/app/AuthGate.tsx` is the sole subscriber to Supabase auth. Its
`onAuthStateChange` handler calls `clearPersistedCache()` on `SIGNED_OUT`
*and* on a same-tab account switch — a `SIGNED_IN` carrying a different
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

The localStorage clears are synchronous; the IDB deletes race the next
sign-in's hydration, which is fine because every operation is idempotent.

## Known limits

- The scrub is per-tab-triggered but the stores are per-origin; a second
  tab signed in as A while this tab switches to B is out of scope (Supabase
  auth broadcasts the sign-out across tabs anyway).
- The SW `talrum-storage-v1` cache is *not* wiped at auth boundaries: it
  holds bytes keyed by storage URL, and reaching them requires a path from
  the (wiped) data and signed-URL caches. Expiry (30 days / 200 entries)
  eventually evicts them.
