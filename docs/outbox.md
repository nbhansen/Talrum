# The outbox: lifecycle of a write

Mutations that change existing state go through `src/lib/outbox` instead of
calling Supabase directly. The goal: a parent on a flaky tablet connection
can rename a pictogram, lose Wi-Fi, close the lid, and the write still lands
— without the UI ever blocking on the network. A small set of writes
deliberately bypasses the queue; the decision rule is in
[queries.md](./queries.md) ("Choosing a write path"). This page carries the
invariants and the why; the inline doc comments in `src/lib/outbox/*` carry
the per-decision detail, including every constant and schedule. For the
_read_ side — the persisted React Query cache and its auth-boundary scrub —
see [offline-cache.md](./offline-cache.md).

## The shape

```
mutation hook (lib/queries/*)
  │  optimistic patch into the React Query cache (see queries.md)
  ▼
enqueueAndDrain(entry)            src/lib/outbox/index.ts
  │ online + empty queue → run the handler immediately (fast path)
  │ otherwise            → persist entry to IndexedDB, drain replays it
  ▼
drain()                           src/lib/outbox/drain.ts
  │ FIFO over pending entries; retries, backoff, status events
  ▼
runHandler(entry)                 src/lib/outbox/handlers.ts
     one handler per entry kind: Supabase table writes, RPCs, Storage I/O
```

Entries are plain objects (plus `Blob`s), discriminated on `kind`, one
IndexedDB key per entry; ULID key order = enqueue order, so FIFO is free.
`handlers.ts` is the only write-path code that talks to Supabase, and
`runHandler` is the single place errors are classified.

## The invariants

- **The fast path requires an empty pending queue** (#279). Jumping ahead of
  older queued entries would let their replay overwrite this newer write
  with stale data. Offline, the mutation promise resolves as soon as the
  entry is persisted — the UI keeps its optimistic state and the indicator
  shows the pending count.
- **A drain stops at the first transient failure** to preserve FIFO order,
  but marks permanent failures as `failed` and moves on, so one bad entry
  can't dam the queue.
- **Drains and queue rewrites serialize across tabs** on a `navigator.locks`
  web lock (#278, #289), so a PWA window plus a browser tab can't replay the
  same entry twice.
- **A transient failure schedules its own re-drain** with capped exponential
  backoff (#391), so an entry that fails while the device stays online never
  waits for an external trigger. The schedule, its reset rules, and the
  attempt budget live together in `drain.ts` / `drain-state.ts`; the budget
  is sized against the schedule, so change them only together.

## Error classification: transient vs permanent

All classification lives in `classifyAndThrow` in `handlers.ts` — handlers
themselves are happy-path only.

- **Transient** (network `TypeError`, 5xx, and an allowlist of retryable
  Postgres codes — serialization, deadlock, connection, pooler capacity,
  statement timeout; the list lives on `handlers.ts`, #394): the entry stays
  `pending` and retries on a bounded attempt budget, after which it flips to
  `failed` so it can't retry forever. On the fast path the same
  classification queues the write instead of failing it: the mutation
  promise resolves, the optimistic patch stands, and the retries run in the
  background.
- **Permanent** (`UnretryableOutboxError`: other coded Postgres errors such
  as RLS denials, 4xx storage errors): no retry. On the fast path the mutation
  promise rejects, so React Query rolls back the optimistic patch and the
  user sees the error. On the slow path the entry is marked `failed`; the
  OfflineIndicator surfaces it with **Retry** (fresh attempt budget, #277)
  and **Discard**.

  Those two buttons exist nowhere else, so where the indicator is mounted is
  part of the recovery path, not decoration: `ParentShell` mounts it once,
  above the page header, so it exists on every parent screen including the
  board builder — the screen where nearly every write is made (#354).

- **Conflict** (boards only, #281): `updateBoard` entries carry the server
  `updated_at` they were computed against and update conditionally; zero
  rows back means another device wrote the board since, and the entry fails
  instead of silently overwriting. The indicator's pill names it ("board
  changed on another device"). Your own queued edits don't trip the guard:
  every landed replay feeds the produced `updated_at` forward (in-memory
  board clock + persisted into the remaining queue, see `board-clock.ts`).
  After a conflict, **Retry** strips the guard — applying your version
  becomes an explicit choice — and **Discard** keeps the other device's
  version.

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
- Queued entries are not deduped or coalesced, and the queue has no size
  bound or TTL — acceptable at this app's write volume, revisit if that
  changes.
