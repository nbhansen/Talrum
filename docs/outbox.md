# The outbox: lifecycle of a write

Mutations that change existing state go through `src/lib/outbox` instead of
calling Supabase directly, so a parent on a flaky tablet connection can rename a
pictogram, lose Wi-Fi, close the lid, and still have the write land. A few
writes bypass the queue; the decision rule is in [queries.md](./queries.md).
For the read side, see [offline-cache.md](./offline-cache.md).

## The shape

```
mutation hook (lib/queries/*)
  │  optimistic patch into the React Query cache (see queries.md)
  ▼
enqueueAndDrain(entry)            src/lib/outbox/index.ts
  │ persist entry to IndexedDB — every path, before any attempt
  │ online + empty queue → status `attempting`, run the handler now,
  │                        delete on success (fast path)
  │ otherwise            → status `pending`, drain replays it
  ▼
drain()                           src/lib/outbox/drain.ts
  │ FIFO over pending entries; retries, backoff, status events
  ▼
runHandler(entry)                 src/lib/outbox/handlers.ts
     one handler per entry kind: Supabase table writes, RPCs, Storage I/O
```

Entries are plain objects (plus `Blob`s), discriminated on `kind`, one
IndexedDB key per entry; ULID key order is enqueue order, so FIFO is free.
`handlers.ts` is the only write-path code that talks to Supabase, and
`runHandler` is the single place errors are classified.

## The invariants

**The fast path requires an empty pending queue** (#279). A write that jumps
older queued entries gets overwritten when they replay. Offline, the mutation
promise resolves as soon as the entry is persisted: the UI keeps its optimistic
state and the indicator shows the pending count.

**The entry is durable before any attempt** (#445). The handler's round trip is
a window in which the page can go away — the auto-reload after a deploy (#442),
a tab close, a crash — and an entry that lived only in memory went with it. The
optimistic cache patch does not survive either, because the persisted cache is
busted by commit, so the write disappeared with no entry, no error, and nothing
to retry. The cost is one put and one delete per online write, and for the
blob-carrying kinds that put copies a few hundred KB into IndexedDB while the
cross-tab lock is held. Durability needs the blob persisted, so that is the
price of the guarantee.

**IDB bookkeeping after a landed handler is best effort** (#446, #449), on both
write paths. The residual is one uncleared entry: `attempting` on the fast path,
so no count names it and the next lock holder adopts it; `pending` on the drain
path, where it counts as queued and the retry schedule replays the write until a
delete works, at the backoff cap of 30 s on a device whose IndexedDB stays
broken. Nothing bounds that replay, where the old behaviour stopped after six
attempts because the delete failure burnt them, and a blob kind re-uploads its
blob every time. The trade is deliberate: the alternative was a `failed` pill
for a write the server had accepted.

**A drain never rejects** (#458). `enqueueAndDrain` awaits one for a write it has already
persisted, so a rejection rolled a durable write back. The status read and the whole drain pass
report and continue instead, and an unreadable queue counts as occupied, or a new write jumps
entries it cannot see. Six drains in a row that IndexedDB stopped from running the queue then stop
the retry timer, and `online` becomes the only reliable trigger: the stuck entries are `pending`,
so there is no pill and no Retry. A landed entry whose delete failed is not one of those, and
keeps its unbounded replay (#459). The counts hold their last values, which on a cold start are
zero — a queue unreadable from boot reports as synced (#462).

**An in-flight entry is `attempting`, not `pending`** (#446). The two are
different facts: `pending` means a write is waiting for a drain, and this one is
running right now. `attempting` is invisible to `pendingCount`, to the drain
loop's filter, and to the fast path's empty-queue check, so no exit path has to
correct a status afterwards.

Recovery is exact rather than a timeout. The fast path holds the cross-tab lock
for its whole attempt, and the browser releases a held lock when its tab dies,
so an `attempting` entry seen *from inside the lock* cannot have a live owner.
`reconcileQueue` promotes those to `pending`, and both `drain` and the fast path
call it first — the fast path so a new write cannot jump an abandoned older one.
The attempt is not counted against the retry budget, because the abandoned write
may have landed server-side and its replay is the ordinary at-least-once case.
Residual: an abandoned attempt shows in no count until a drain next takes the
lock, which offline means waiting for `online`.

**An entry runs only for the account that enqueued it** (#446). Each entry
carries `enqueuedBy`, and `reconcileQueue` deletes any entry the current session
did not enqueue. An entry without it predates the stamp — unattributed, not
foreign, so it is kept. Two rules make this hold:

- `enqueueAndDrain` reads the owner **at call time**, never after the lock wait.
  A read inside the lock callback happens after the auth boundary has moved, and
  would label user A's write with user B. If the account changed while the write
  queued for the lock, the write is abandoned rather than stamped.
- `drain` does nothing while no account is known. `startOutbox` drains at module
  load, before AuthGate resolves the session, so without the gate the first
  drain after every reload would replay the previous account's leftovers.
  `setOutboxOwner` runs the drain that gate skips.

The sweep in `clearPersistedCache` is deliberately **not** under the outbox
lock. The lock would only stop a write landing between the sweep's `keys()`
snapshot and its deletes, never one already waiting on it, so the sweep was
never what made this hold. It is held across handler IO, so taking it would
leave user A's blobs on a shared device for a whole upload.

**A drain stops at the first transient failure** to preserve FIFO order, but
marks permanent failures `failed` and moves on, so one bad entry cannot dam the
queue. It stops the same way at a landed entry its delete could not clear: that
entry is still queued, so a write behind it would land first and then be
overwritten by the replay. That stop alone has no time bound — an uncleared
entry burns no attempt, so it never reaches `failed` and the drain never skips
it. A write for an unrelated row waits too, until a delete works.

**Drains, queue rewrites, and enqueues serialize across tabs** on a
`navigator.locks` web lock (#278, #289, #395), so a PWA window and a browser tab
cannot replay the same entry. Every enqueue holds the lock from the queue
observation through its outcome, so check and outcome are atomic. The cost:
online writes serialize within and across tabs, and a slow upload in one tab
stalls the other's drain. `fetch` has no default timeout, so `runHandler` bounds
each run itself (#413, with a longer bound for blob kinds): a run that outlives
its bound rejects as transient, releases the lock, and retries.

**A transient failure schedules its own re-drain** with capped exponential
backoff (#391), so an entry that fails while the device stays online never waits
for an external trigger. The schedule, its reset rules, and the attempt budget
live together in `drain.ts` and `drain-state.ts`; the budget is sized against
the schedule, so change them only together.

## Error classification: transient vs permanent

All classification lives in `classifyAndThrow` in `handlers.ts`.

- **Transient** (network `TypeError`, 5xx, and an allowlist of retryable
  Postgres codes, #394): the entry stays `pending` and retries on a bounded
  budget, then flips to `failed` so it cannot retry forever. On the fast path
  the same classification queues the write instead of failing it — the mutation
  promise resolves and the optimistic patch stands.
- **Permanent** (`UnretryableOutboxError`: other coded Postgres errors such as
  RLS denials, 4xx storage errors): no retry. On the fast path the mutation
  promise rejects, so React Query rolls the patch back. On the slow path the
  entry is marked `failed` and the OfflineIndicator offers **Retry** (fresh
  budget, #277) and **Discard**. Those buttons exist nowhere else, so where the
  indicator is mounted is part of the recovery path: `ParentShell` mounts it
  once, above the page header, so it reaches every parent screen (#354).
- **Conflict** (boards only, #281): `updateBoard` entries carry the server
  `updated_at` they were computed against and update conditionally. Zero rows
  back means another device wrote the board since, and the entry fails instead
  of silently overwriting. Your own queued edits do not trip the guard, because
  every landed replay feeds the produced `updated_at` forward (`board-clock.ts`,
  plus a persisted copy into the remaining queue). After a conflict **Retry**
  strips the guard, making your version an explicit choice, and **Discard**
  keeps the other device's.

## Rules for writing a handler

New entry kind? Add the interface in `types.ts`, the handler in `handlers.ts`, a
`dispatch` case, and a mutation hook. Handlers must be:

- **Idempotent.** A drain can replay an entry that already partly succeeded, so
  re-running must converge, not error. Server-side `array_remove`,
  `ON DELETE CASCADE` and RPC no-ops are the usual tools; see `delete_pictogram`
  (#280).

  Guarded `updateBoard` is the exception, by design. A reload starts with an
  empty board clock, so the replay still carries the `expectedUpdatedAt` its own
  landed write invalidated and the caregiver gets a conflict pill for their own
  write. Recoverable — Retry strips the guard — and a recoverable wrong pill
  beats the silent loss it replaced.
- **Authorization-free.** RLS is the security boundary. A handler running
  against someone else's rows should fail at the database, never by a
  client-side check.
- **Order-aware.** Put the steps whose failure should retry the whole entry
  first, such as Storage cleanup before a row delete. Best-effort cleanup that
  must never fail the write uses `.catch(reportCleanupFailure)`.
- **Happy-path only.** Throw raw Supabase and Storage errors; `runHandler` owns
  classification. Never catch and swallow.
- **Storage cleanup reads the row, never a client snapshot.** Which object a
  write supersedes is decided by the row's `image_path`/`audio_path`, read at
  replay time (#418). A cache snapshot holds a `blob:` URL between an enqueue
  and the settle refetch, so a snapshot-based path orphans the superseded
  object. FIFO replay makes the row read exact for offline chains.
- **Cancellation-aware when multi-step.** A run abandoned by the handler timeout
  keeps executing as a zombie, and its later steps could undo work a causally
  later entry has done. A handler with more than one side-effecting step must
  take the `AbortSignal` from `dispatch` and call `throwIfCancelled` between
  steps (see `handleClearPictogramAudio`).

## Known limits

- The board conflict guard (#281) is column-blind: a rename on one device and a
  step edit on another touch different columns yet still surface as a conflict.
  Non-board tables replay last-write-wins.
- Cross-tab serialization relies on the Web Locks API. Without
  `navigator.locks`, only the per-tab re-entrancy guard applies.
- Queued entries are not deduped or coalesced, and the queue has no size bound
  or TTL. Acceptable at this app's write volume.
- A run abandoned by the handler timeout can have a request in flight that lands
  after later entries ran. For row writes this is the last-write-wins class
  above. Storage objects are safe by construction: every upload gets a unique
  versioned path (`mintStoragePath`, #415), minted once per entry, so late IO
  lands on a path no newer write owns and at worst leaks one orphan. Residual
  orphans are rare, small and unreferenced — accepted on the free tier. They
  come from a failed create's upload, an abandoned run's late upload,
  interleaved cross-device writes, and a crash between a row update landing and
  its cleanup remove, where the replay reads its own path back and skips the
  remove. That last one is the cost of reading the row instead of a snapshot.
- The handler timeout is wall-clock and a retry restarts the transfer from byte
  zero, so the blob bound is a ceiling on what can sync. Every blob is bounded
  by construction (512px JPEG photos, `MAX_RECORDING_MS` recordings, #416), so
  the ceiling binds only on an uplink too slow for a few hundred KB. The cap and
  the bound reference each other; change them together.
- A hung request that was delivered but whose response never came commits
  server-side without the client learning it. A guarded `updateBoard` retry then
  trips its own conflict guard and fails with the pill for the device's own
  write. Recoverable through Retry, and the same class `TRANSIENT_DB_CODES`
  accepts for connection errors — but a socket stuck open is the shape where the
  commit most likely did land.
