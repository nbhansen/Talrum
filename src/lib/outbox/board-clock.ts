/**
 * Newest server `updated_at` this device has produced for each board (#281).
 * The trigger bumps `updated_at` on our own writes too, so a queued entry's
 * raw baseline would conflict against our own replay. In-memory only; a
 * reload re-seeds from the first replay. Keep import-free for the test setup.
 */
const newestByBoard = new Map<string, string>();

/**
 * Compares lexicographically, not via `Date.parse`. Every value is PostgREST
 * timestamptz, so string order equals time order — including the microseconds
 * `Date.parse` truncates, which would let a stale value win a `>=` race.
 */
export const noteBoardUpdatedAt = (boardId: string, updatedAt: string): void => {
  const known = newestByBoard.get(boardId);
  if (known === undefined || updatedAt >= known) {
    newestByBoard.set(boardId, updatedAt);
  }
};

/**
 * An `undefined` baseline means the entry is unguarded. Never invent a guard
 * for it: Retry-after-conflict relies on a stripped guard staying stripped.
 */
export const resolveExpectedUpdatedAt = (
  boardId: string,
  baseline: string | undefined,
): string | undefined => {
  if (baseline === undefined) return undefined;
  const known = newestByBoard.get(boardId);
  if (known === undefined) return baseline;
  return known >= baseline ? known : baseline;
};

export const __resetBoardClockForTests = (): void => {
  newestByBoard.clear();
};
