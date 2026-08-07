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
  │ persist entry to IndexedDB — every path, before any attempt
  │ online + empty queue → run the handler now, delete on success (fast path)
  │ otherwise            → leave it queued, drain replays it
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
- **The entry is durable before any attempt** (#445). The fast path persists
  the entry, runs the handler, then deletes it. The handler's round trip is a
  window in which the page can go away — the auto-reload after a deploy
  (#442), a tab close, a crash — and an entry that lived only in memory went
  with it. The optimistic cache patch does not survive either (the persisted
  cache is busted by commit), so the write disappeared with no queue entry, no
  error, and nothing for the user to retry. The cost: one put and one delete
  per online write, and a status emit during the round trip counts the
  in-flight entry as pending, which is what it is.
- **A drain stops at the first transient failure** to preserve FIFO order,
  but marks permanent failures as `failed` and moves on, so one bad entry
  can't dam the queue.
- **Drains, queue rewrites, and enqueues serialize across tabs** on a
  `navigator.locks` web lock (#278, #289, #395), so a PWA window plus a
  browser tab can't replay the same entry twice. Every enqueue holds the
  lock from the queue observation through its outcome — the handler run on
  the fast path, the queue append otherwise — so check and outcome are
  atomic and another tab can't slip a write in between. The cost: the lock
  is held across handler IO, blob uploads included, so online writes
  serialize within a tab and across tabs — a slow upload in one tab stalls
  the other tab's drain and fast path until it settles or its tab dies.
  `fetch` has no default timeout, so `runHandler` bounds each run itself
  (#413, longer bound for blob-carrying kinds whose transfers are
  legitimately slow): a run that outlives its handler timeout rejects as
  transient, releases the lock, and retries on the backoff schedule. Accepted at this
  app's write volume.
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
  succeeded — the fast path crashed after the Storage upload but before the
  table write, or it landed the whole write and the page went away before the
  entry was deleted (#445). Re-running must converge, not error. Server-side
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
- **Storage cleanup reads the row, never a client snapshot.** Which object
  a write supersedes is decided by the row's `image_path`/`audio_path`,
  read by the handler at replay time (`readRowPaths`, #418 review). Cache
  snapshots hold `blob:` URLs between an enqueue and the settle refetch,
  so a snapshot-based `previousPath` misses the cleanup and orphans the
  superseded versioned object. FIFO replay makes the row read exact for
  offline chains: each entry sees the path its predecessor landed.
- **Cancellation-aware when multi-step.** A run abandoned by the handler
  timeout (#413) keeps executing as a zombie. A handler with more than one
  side-effecting step must take the `AbortSignal` from `dispatch` and call
  `throwIfCancelled` between steps, so the zombie starts nothing new after
  the timeout — its later steps could undo work a causally later entry has
  done since (see `handleClearPictogramAudio`).

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
- A run abandoned by the handler timeout (#413) can have a request already
  in flight, and that request can land after later entries ran. For row
  writes this is the same last-write-wins class as cross-device replays
  (boards stay safe via the conflict guard); the between-step cancellation
  checks stop the zombie from starting anything new. Storage objects are
  safe by construction: every upload gets a unique versioned path
  (`mintStoragePath`, #415), minted once per entry, so a late upload or
  `remove` lands on a path no newer write owns — at worst it leaks one
  orphaned object. The row's `image_path`/`audio_path` is the single
  source of truth for which object is current, and handlers derive their
  cleanup from it (#418 review). Residual orphans are rare, small, and
  unreferenced — accepted on the free tier's quota until real usage says
  otherwise. The sources: a failed create's upload; an abandoned run's
  late upload; cross-device writes interleaving a read with an update; and
  a crash (or timeout) between the row update landing and the cleanup
  remove — the replay reads its own path back (or `null`, after a clear)
  and skips the remove, so the superseded object stays. That last one is
  the cost of reading the row instead of trusting a snapshot: the replay
  can no longer tell the superseded object apart from its own.
- The handler timeout is wall-clock and a retry restarts the transfer from
  byte zero, so the blob bound is a ceiling on what can sync. Every blob is
  bounded by construction — photos are re-encoded to 512px JPEG and
  recordings are capped at `MAX_RECORDING_MS` (#416) — so the ceiling only
  binds on an uplink too slow to move a few hundred KB inside the bound.
  The cap and the bound reference each other; change them together.
- A hung request that was delivered but whose response never came commits
  server-side without the client learning it. For a guarded `updateBoard`
  the retry then trips its own conflict guard (the board clock never noted
  the commit's `updated_at`) and the entry fails with the conflict pill for
  the device's own write. Recoverable — Retry strips the guard — and the
  same class the `TRANSIENT_DB_CODES` note accepts for connection errors,
  but a socket stuck open is the shape where the commit most likely did
  land.
