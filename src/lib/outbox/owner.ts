/**
 * Which account the queue currently belongs to.
 *
 * An outbox entry is a write on behalf of one signed-in user, and on a shared
 * device it must never run on behalf of a different one. The sign-out sweep in
 * `queryClient.ts` deletes the queue at the auth boundary, but a sweep alone
 * cannot close the window: an enqueue that is already waiting on the cross-tab
 * lock runs after the sweep finishes, and writes its entry — blob included —
 * behind the deletes (#446 review).
 *
 * So the entry records who enqueued it, and `reconcileQueue` (drain.ts) drops
 * any entry belonging to somebody else. The sweep stays as the thing that
 * clears the bytes promptly; this is what makes the guarantee hold whatever
 * the ordering.
 *
 * Read it at the *start* of a write, never after a lock wait: this value
 * changes at the auth boundary, which is exactly the moment being guarded
 * against. `enqueueAndDrain` captures it before it queues for the lock.
 *
 * Module state, not React state, because the write path is not a component.
 * Set through `setOutboxOwner` in the outbox's index, which also kicks the
 * drain the new session is owed. AuthGate calls it from the same
 * `onAuthStateChange` listener that triggers the sweep, so the two can never
 * disagree about the boundary.
 */
let ownerId: string | null = null;

/** Internal. Callers use `setOutboxOwner` from the outbox index. */
export const setOwnerId = (id: string | null): void => {
  ownerId = id;
};

export const getOutboxOwner = (): string | null => ownerId;

/** Test seam — the module-level owner outlives a component tree. */
export const __resetOutboxOwnerForTests = (): void => {
  ownerId = null;
};
