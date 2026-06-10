# The outbox: lifecycle of a write

Every mutation in Talrum goes through `src/lib/outbox` instead of calling
Supabase directly. The goal: a parent on a flaky tablet connection can rename
a pictogram, lose Wi-Fi, close the lid, and the write still lands — without
the UI ever blocking on the network. This page is the narrative; the inline
doc comments in `src/lib/outbox/*` carry the per-decision detail.

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
   immediately — no IndexedDB detour. The fast path requires an *empty
   pending queue*: jumping ahead of older queued entries would let their
   replay overwrite this newer write with stale data (#279).
3. **Slow path.** Offline, or online with a backlog: the entry is persisted
   to IndexedDB and `drain()` (or the next `online` event) replays it.
   Offline, the promise resolves as soon as the entry is persisted — the UI
   keeps its optimistic state and the indicator shows the pending count.
   Online with a backlog, it resolves only after the queue flush attempt
   (`drain()` never rejects), so the write may already have landed.
4. **Drain.** `drain()` walks pending entries oldest-first. It stops at the
   first *transient* failure to preserve ordering, but marks *permanent*
   failures as `failed` and moves on, so one bad entry can't dam the queue.
   `startOutbox()` (called once at app boot) wires the `online` event and
   kicks an initial drain for entries left over from a previous session.

## Error classification: transient vs permanent

All classification lives in `classifyAndThrow` in `handlers.ts` — handlers
themselves are happy-path only.

- **Transient** (network `TypeError`, 5xx): the entry stays `pending` and is
  retried on the next drain, up to 3 attempts, after which it flips to
  `failed` so it can't retry forever.
- **Permanent** (`UnretryableOutboxError`: coded Postgres errors such as RLS
  denials, 4xx storage errors): no retry. On the fast path the mutation
  promise rejects, so React Query rolls back the optimistic patch and the
  user sees the error. On the slow path the entry is marked `failed`; the
  OfflineIndicator surfaces it with **Retry** (resets failed entries to
  pending with a fresh attempt budget, #277) and **Discard**.

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
  *retry the whole entry* first (e.g. Storage cleanup before the row
  delete). Best-effort cleanup that must never fail the write uses
  `.catch(reportCleanupFailure)`, which logs to telemetry instead of
  throwing.
- **Happy-path only.** Throw raw Supabase/Storage errors; `runHandler` owns
  classification. Never catch-and-swallow.

## Known limits

- The queue is per-tab: two open tabs each drain independently, which can
  duplicate work (#278).
- Replays are last-write-wins per column; concurrent edits to a shared board
  can silently discard one side (#281).
