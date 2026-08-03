// Module-level state backing `./drain.ts`. Lives in its own file (no Supabase
// or `@/*` imports) so vitest.setup.ts can import the reset hook without
// dragging the runtime client through tsconfig.node.json. Same pattern as
// `src/lib/storage-cache.ts`.

export interface OutboxStatus {
  online: boolean;
  pendingCount: number;
  failedCount: number;
  /**
   * How many of the failed entries are board conflicts (#281) — lets the
   * indicator name the conflict instead of only counting generic failures.
   */
  conflictCount: number;
  draining: boolean;
  /**
   * True while the current drain was started by the retry timer (#391).
   * The OfflineIndicator keeps its live-region label at "Sync queued · N"
   * for these instead of flipping to "Syncing…" — a transient outage
   * re-drains every few seconds, and a polite live region re-announces on
   * every text change (#409).
   */
  timerDrain: boolean;
}

interface DrainState {
  draining: boolean;
  /** Mirror of `OutboxStatus.timerDrain` for the drain in progress. */
  timerDrain: boolean;
  pendingDrain: boolean;
  listenersAttached: boolean;
  lastStatus: OutboxStatus;
  /** Scheduled re-drain after a transient failure (#391). */
  retryTimer: ReturnType<typeof setTimeout> | undefined;
  /** Delay for the next scheduled re-drain; doubles per transient pass. */
  retryDelayMs: number;
}

/** First re-drain delay after a transient failure (#391). */
export const RETRY_BASE_DELAY_MS = 2_000;
/** Backoff ceiling for the scheduled re-drain (#391). */
export const RETRY_MAX_DELAY_MS = 30_000;

const initialStatus = (): OutboxStatus => ({
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  pendingCount: 0,
  failedCount: 0,
  conflictCount: 0,
  draining: false,
  timerDrain: false,
});

export const drainState: DrainState = {
  draining: false,
  timerDrain: false,
  pendingDrain: false,
  listenersAttached: false,
  lastStatus: initialStatus(),
  retryTimer: undefined,
  retryDelayMs: RETRY_BASE_DELAY_MS,
};

export const drainSubscribers = new Set<(s: OutboxStatus) => void>();

export const __resetDrainForTests = (): void => {
  clearTimeout(drainState.retryTimer);
  drainState.draining = false;
  drainState.timerDrain = false;
  drainState.pendingDrain = false;
  drainState.listenersAttached = false;
  drainState.lastStatus = initialStatus();
  drainState.retryTimer = undefined;
  drainState.retryDelayMs = RETRY_BASE_DELAY_MS;
  drainSubscribers.clear();
};
