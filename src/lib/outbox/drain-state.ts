// Module-level state backing `./drain.ts`. Lives in its own file (no Supabase
// or `@/*` imports) so vitest.setup.ts can import the reset hook without
// dragging the runtime client through tsconfig.node.json. Same pattern as
// `src/lib/storage/storage-cache.ts`.

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
   * The OfflineIndicator holds its label steady for these, because an outage
   * re-drains every few seconds and each text change re-announces (#409).
   */
  timerDrain: boolean;
  /**
   * The last queue read failed, so the counts are the last good ones. A queue
   * whose last good read was clean would otherwise report as synced (#462).
   */
  queueUnreadable: boolean;
}

interface DrainState {
  draining: boolean;
  /** Mirror of `OutboxStatus.timerDrain` for the drain in progress. */
  timerDrain: boolean;
  pendingDrain: boolean;
  listenersAttached: boolean;
  lastStatus: OutboxStatus;
  retryTimer: ReturnType<typeof setTimeout> | undefined;
  /** Doubles per transient pass, up to RETRY_MAX_DELAY_MS. */
  retryDelayMs: number;
  stalledDrains: number;
}

// The retry schedule (#391). MAX_ATTEMPTS_BEFORE_FAILED in drain.ts is sized
// against these two, so change them together.
export const RETRY_BASE_DELAY_MS = 2_000;
export const RETRY_MAX_DELAY_MS = 30_000;

const initialStatus = (): OutboxStatus => ({
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  pendingCount: 0,
  failedCount: 0,
  conflictCount: 0,
  draining: false,
  timerDrain: false,
  queueUnreadable: false,
});

export const drainState: DrainState = {
  draining: false,
  timerDrain: false,
  pendingDrain: false,
  listenersAttached: false,
  lastStatus: initialStatus(),
  retryTimer: undefined,
  retryDelayMs: RETRY_BASE_DELAY_MS,
  stalledDrains: 0,
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
  drainState.stalledDrains = 0;
  drainSubscribers.clear();
};
