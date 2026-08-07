/**
 * Which account the queue currently belongs to.
 *
 * An outbox entry is a write on behalf of one signed-in user, and on a shared
 * device it must never run on behalf of a different one. The sign-out sweep in
 * `queryClient.ts` deletes the queue at the auth boundary, but a sweep alone
 * cannot close the window: a fast path already waiting on the cross-tab lock
 * acquires it *after* the sweep releases, and writes its entry — blob included
 * — behind the deletes (#446 review).
 *
 * So the entry carries its owner and `reconcileQueue` (drain.ts) drops any
 * entry that belongs to somebody else. The sweep stays as the thing that
 * clears the bytes promptly; this is what makes the guarantee hold whatever
 * the ordering.
 *
 * Set from AuthGate's `onAuthStateChange`, which is the same listener that
 * triggers the sweep, so the two can never disagree about the boundary.
 * Module state, not React state, because the write path is not a component.
 */
let ownerId: string | null = null;

export const setOutboxOwner = (id: string | null): void => {
  ownerId = id;
};

export const getOutboxOwner = (): string | null => ownerId;

/** Test seam — the module-level owner outlives a component tree. */
export const __resetOutboxOwnerForTests = (): void => {
  ownerId = null;
};
