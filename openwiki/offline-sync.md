---
type: Reference
title: Offline Synchronization Model
description: Deep dive into Talrum's offline synchronization model, highlighting optimistic caching, IndexedDB outbox queues, Web Locks-driven FIFO replay, conflict management, and security boundary clearing.
resource: /src/lib/outbox/drain.ts
tags: [offline, outbox, synchronization, caching, indexeddb]
---

# Offline Synchronization Model

Because children can experience immediate distress from unexpected loading spinners, Talrum utilizes an offline-first architecture. Write operations are processed optimistically on the client first, then queued in a durable outbox to be replayed sequentially when a connection is available.

---

## 1. The Write Path: Optimistic UI & Outbox Queue

Database writes bypass direct network execution. Instead, they flow through a structured outbox manager (`src/lib/outbox/index.ts`).

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

### Optimistic Cache Patching
React Query mutation hooks (such as those in `src/lib/queries/boards.mutations.ts`) execute an `onMutate` handler. This handler:
1.  Cancels active queries matching the affected records.
2.  Snapshots the current query cache state.
3.  Directly updates the local cache with the expected final value.

If the update fails permanently, the `onError` hook restores the cached snapshot to align the UI with the server state.

### Fast Path vs. Slow Path Dispatching
When a mutation is triggered, the system evaluates the state of the network and the outbox queue:
*   **The Fast Path:** If the device is online and the outbox queue is completely empty, the mutation is executed against the Supabase database immediately.
*   **The Slow Path:** If the device is offline or there is a backlog of items in the queue, the mutation is serialized to IndexedDB as an outbox entry. Resolving the client-side promise immediately allows the user to continue interacting with the app.
*   *Why this split exists:* Executing a write immediately while earlier writes are still queued offline would lead to out-of-order execution, causing data corruption and state conflicts.

### Outbox Storage & ULID Sorting
Offline mutations are written to IndexedDB via the `idb-keyval` library under the key prefix `outbox:{ulid}`. Because Universally Unique Lexicographical Identifiers (ULIDs) sort alphabetically, fetching IndexedDB keys naturally retrieves outbox entries in chronological order. This ensures strict **First-In, First-Out (FIFO)** execution.

### Replay Loop & Web Locks
The outbox replay is coordinated by `drain()` in `src/lib/outbox/drain.ts`. 

To prevent multiple browser tabs from trying to replay the same outbox writes simultaneously—which could trigger duplicate records or cause race conditions—the replay loop is synchronized using the browser's Web Locks API:
```typescript
await navigator.locks.request('talrum-outbox-drain', async () => {
  // Replay logic runs inside this lock
});
```
Only one tab can hold the `talrum-outbox-drain` lock at a time, ensuring that outbox writes are processed sequentially by a single coordinator thread.

### Error Classification & Queue Handling

| Error Category | Triggering Condition | Queue Behavior | Mitigation / Resolution |
| :--- | :--- | :--- | :--- |
| **Transient Error** | Network timeout, dropped connection, or `5xx` server error. | The queue halts replay to preserve write order. Retries up to 3 times before setting status to `failed`. | The loop restarts automatically once the network state transitions back to `online`. |
| **Permanent Error** | Bad request parameters or RLS validation failure (`4xx`). | The entry is marked `failed` immediately. The queue skips it to avoid blocking subsequent writes. | Caregivers can review, retry, or delete failed writes via the `OfflineIndicator` widget. |
| **Conflict Error** | Optimistic concurrency check fails (e.g. `updated_at` timestamps mismatch). | The entry is marked as `failed` with a conflict flag. | The caregiver resolves the conflict in the UI: **Retry** forces the write by overwriting the server; **Discard** keeps the server version. |

---

## 2. The Read Path: Offline Cache Structure

Talrum maintains three isolated storage environments on the client to facilitate offline reads:

1.  **React Query Cache (`talrum-react-query`):** Persists successful query responses (`status === 'success'`) on disk using IndexedDB. Pending or failed queries are skipped during persistence to prevent incomplete state from polluting local storage. This cache is versioned with the build-time variable `__APP_VERSION__` and has a `maxAge` limit of seven days.
2.  **Outbox Queue Cache:** Retains pending outbox entries, including the local file Blobs for newly recorded audio clips and custom pictogram images.
3.  **Service Worker Cache (`talrum-storage-v1`):** Cache-first strategy for static assets, with a runtime cache for custom media (images and audio files) capped at 200 entries or 30 days. It uses the `ignoreSearch` option, allowing cached custom assets to resolve even when their hourly-signed Supabase URL query parameters change.

---

## 3. The Auth Boundary Scrub

To prevent data leakage on shared or public tablets, `src/app/AuthGate.tsx` monitors auth state transitions. When a user signs out or switches accounts, the application triggers a comprehensive data sweep:

### Synchronous Deletion
*   Resets in-memory React state variables.
*   Wipes the parent PIN hash from `localStorage` (`clearPin()`).
*   Clears the pointer to the last visited board (`clearLastBoard()`).

### Asynchronous Deletion
*   Wipes the react-query database in IndexedDB.
*   Clears all cached signed URLs (`signed-url:*` keys in IndexedDB).
*   Deletes all pending outbox writes (`outbox:*` keys) to prevent a subsequent user from replaying the previous user's offline edits.

---

## Concept Relationships

The offline synchronization model ensures transaction integrity across network states:
*   This offline synchronization model [depends on](architecture.md) the database layout and client routing defined in the system architecture.
*   The outbox replay handlers and error classifications are [verified through](operations-testing.md) the integration test suites described in the testing section.
