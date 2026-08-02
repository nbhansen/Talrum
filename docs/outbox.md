# The outbox: lifecycle of a write

Every mutation in Talrum goes through `src/lib/outbox` instead of calling
Supabase directly. The goal: a parent on a flaky tablet connection can rename
a pictogram, lose Wi-Fi, close the lid, and the write still lands — without
the UI ever blocking on the network. This page is the narrative; the inline
doc comments in `src/lib/outbox/*` carry the per-decision detail. For the
_read_ side — the persisted React Query cache and its auth-boundary scrub —
see `docs/offline-cache.md`.

## The shape

```
mutation hook (lib/queries/*)
  │  onMutate: optimistic patch into the React Query cache
  ▼
enqueueAndDrain(entry)            src/lib/outbox/index.ts
  │ online + empty queue → run the handler immediately (fast path)
  │ otherwise            → persist entry to IndexedDB, drain replays it
  ▼
drain()                           src/lib/outbox/drain.ts
  │ FIFO over pending entries; retries, retry ceiling, status events
  ▼
runHandler(entry)                 src/lib/outbox/handlers.ts
     one handler per entry kind: Supabase table writes, RPCs, Storage I/O
```

- **`types.ts`** — one interface per entry kind (`updateBoard`,
  `deletePicto`, …), discriminated on `kind`. Entries are plain objects (plus
  `Blob`s) because they must survive IndexedDB round-trips.
- **`store.ts`** — IndexedDB persistence via `idb-keyval`. One key per entry
  (`outbox:{ulid}`); ULID key order = enqueue order, so FIFO is free.
- **`drain.ts`** — the replay loop plus the status feed
  (`pendingCount` / `failedCount` / `draining` / `online`) that
  `useOutboxStatus` exposes and `widgets/OfflineIndicator` renders.
- **`handlers.ts`** — the only code that talks to Supabase for writes, and
  the single place errors are classified (`runHandler` wraps every handler).

## One write, step by step

1. **Optimistic patch.** The mutation hook's `onMutate` writes the expected
   result into the React Query cache, so the UI updates instantly. `onError`
   restores the pre-mutation snapshot; `onSettled`/`onSuccess` invalidate so
   the next refetch reconciles with the server.
2. **Fast path (online, empty queue).** `enqueueAndDrain` runs the handler
   immediately — no IndexedDB detour. The fast path requires an _empty
   pending queue_: jumping ahead of older queued entries would let their
   replay overwrite this newer write with stale data (#279).
3. **Slow path.** Offline, or online with a backlog: the entry is persisted
   to IndexedDB and `drain()` (or the next `online` event) replays it.
   Offline, the promise resolves as soon as the entry is persisted — the UI
   keeps its optimistic state and the indicator shows the pending count.
   Online with a backlog, it resolves only after the queue flush attempt
   (`drain()` never rejects), so the write may already have landed.
4. **Drain.** `drain()` walks pending entries oldest-first. It stops at the
   first _transient_ failure to preserve ordering, but marks _permanent_
   failures as `failed` and moves on, so one bad entry can't dam the queue.
   Drains — and the Retry/Discard queue rewrites (#289) — serialize across
   tabs on a `navigator.locks` web lock, so a PWA window plus a browser tab
   can't replay the same entry twice (#278).
   `startOutbox()` (called once at app boot) wires the `online` event and
   kicks an initial drain for entries left over from a previous session.
   A drain that stops on a transient failure also schedules its own re-drain
   on a timer — 2 s at first, doubling per transient pass up to 30 s (#391).
   The `offline` event cancels the timer; the `online` event is the next
   trigger. The delay resets when a pass lands any entry, when a pass ends
   with no transient failure, and on a user Retry. The schedule is per tab:
   each open tab arms its own timer against the shared queue.

## Error classification: transient vs permanent

All classification lives in `classifyAndThrow` in `handlers.ts` — handlers
themselves are happy-path only.

- **Transient** (network `TypeError`, 5xx): the entry stays `pending` and is
  retried on the next drain, up to 6 attempts, after which it flips to
  `failed` so it can't retry forever. The attempt budget is sized against
  the retry-timer backoff schedule (#391): in a single tab the sixth attempt
  runs about a minute after the first, so a short blip can't exhaust it.
  More open tabs spend the shared budget faster; Retry recovers the entry.
- **Permanent** (`UnretryableOutboxError`: coded Postgres errors such as RLS
  denials, 4xx storage errors): no retry. On the fast path the mutation
  promise rejects, so React Query rolls back the optimistic patch and the
  user sees the error. On the slow path the entry is marked `failed`; the
  OfflineIndicator surfaces it with **Retry** (resets failed entries to
  pending with a fresh attempt budget, #277) and **Discard**.

  Those two buttons exist nowhere else, so where the indicator is mounted is
  part of the recovery path, not decoration. `ParentShell` mounts it once,
  above the page header rather than inside it — inside, it only rendered on
  screens that passed a `title`, which excluded the board builder, the screen
  where nearly every write in the app is made (#354).

- **Conflict** (boards only, #281): `updateBoard` entries carry the server
  `updated_at` they were computed against and update conditionally; zero
  rows back means another device wrote the board since, and the entry fails
  instead of silently overwriting. The indicator's pill names it ("board
  changed on another device", via `conflictCount` in the status feed). Your
  own queued edits don't trip the guard: every landed replay — guarded or
  not — feeds the produced `updated_at` forward (in-memory board clock +
  persisted into the remaining queue, see `board-clock.ts`). After a
  conflict, **Retry** strips the guard — applying your version becomes an
  explicit choice — and **Discard** keeps the other device's version.

## Rules for writing a handler

New entry kind? Add the interface in `types.ts`, the handler in
`handlers.ts`, a `dispatch` case, and a mutation hook. Handlers must be:

- **Idempotent.** A drain can replay an entry that already (partially)
  succeeded — e.g. the fast path crashed after the Storage upload but before
  the table write. Re-running must converge, not error. Server-side
  `array_remove`/`ON DELETE CASCADE`/RPC no-ops are the usual tools; see
  `delete_pictogram` (#280).
- **Authorization-free.** RLS is the security boundary; a handler running
  against someone else's rows should fail (or no-op) at the database, never
  by client-side checks.
- **Order-aware.** Within one entry, put the steps whose failure should
  _retry the whole entry_ first (e.g. Storage cleanup before the row
  delete). Best-effort cleanup that must never fail the write uses
  `.catch(reportCleanupFailure)`, which logs to telemetry instead of
  throwing.
- **Happy-path only.** Throw raw Supabase/Storage errors; `runHandler` owns
  classification. Never catch-and-swallow.

## Known limits

- Board updates are conflict-guarded (#281), but the guard is column-blind:
  a rename on one device and a step edit on another touch different columns
  yet still surface as a conflict prompt rather than merging. Non-board
  tables (pictogram renames, audio swaps) still replay last-write-wins.
- Cross-tab serialization (#278, #289) relies on the Web Locks API; in an
  environment without `navigator.locks` only the per-tab re-entrancy guard
  applies.
