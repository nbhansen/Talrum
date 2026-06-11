/**
 * Per-board record of the newest server `updated_at` this device has
 * produced (#281).
 *
 * The `boards_set_updated_at` trigger bumps `updated_at` on every UPDATE —
 * including our own. Entries enqueued before an earlier write for the same
 * board has replayed carry a baseline that our own replay immediately
 * invalidates; guarding with the raw baseline would conflict against
 * ourselves (offline edit chains, rapid online edits racing the refetch).
 * Successful updateBoard handlers note the timestamp the server returned,
 * and `resolveExpectedUpdatedAt` substitutes it when it is newer than an
 * entry's own baseline.
 *
 * In-memory only: a reload starts empty and the first replay re-seeds it
 * from its own baseline. Cross-tab handoff is covered by the drain loop
 * persisting resolved baselines back into pending entries (see `drain.ts`).
 * Keep this module import-free — `vitest.setup.ts` resets it globally, so it
 * must stay loadable outside the app graph like `drain-state.ts`.
 */
const newestByBoard = new Map<string, string>();

export const noteBoardUpdatedAt = (boardId: string, updatedAt: string): void => {
  const known = newestByBoard.get(boardId);
  if (known === undefined || Date.parse(updatedAt) >= Date.parse(known)) {
    newestByBoard.set(boardId, updatedAt);
  }
};

/**
 * The guard an updateBoard entry should use right now: the newer of the
 * entry's own baseline and the last timestamp this device produced for the
 * board. An `undefined` baseline means the entry is unguarded — never invent
 * a guard for it (Retry-after-conflict relies on a stripped guard staying
 * stripped).
 */
export const resolveExpectedUpdatedAt = (
  boardId: string,
  baseline: string | undefined,
): string | undefined => {
  if (baseline === undefined) return undefined;
  const known = newestByBoard.get(boardId);
  if (known === undefined) return baseline;
  return Date.parse(known) >= Date.parse(baseline) ? known : baseline;
};

export const __resetBoardClockForTests = (): void => {
  newestByBoard.clear();
};
