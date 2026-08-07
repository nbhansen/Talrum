/**
 * Which account the queue belongs to, so `reconcileQueue` can drop everybody
 * else's entries: the sign-out sweep cannot close the window alone, because an
 * enqueue already waiting on the lock writes behind it (#446). Read it at the
 * start of a write, never after a lock wait, which is when it moves.
 */
let ownerId: string | null = null;

/** Internal. Callers use `setOutboxOwner` from the outbox index. */
export const setOwnerId = (id: string | null): void => {
  ownerId = id;
};

export const getOutboxOwner = (): string | null => ownerId;

/** Test seam: this outlives a component tree. */
export const __resetOutboxOwnerForTests = (): void => {
  ownerId = null;
};
