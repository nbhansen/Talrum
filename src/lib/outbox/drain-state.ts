// Module-level state backing `./drain.ts`. Lives in its own file (no Supabase
// or `@/*` imports) so vitest.setup.ts can import the reset hook without
// dragging the runtime client through tsconfig.node.json. Same pattern as
// `src/lib/storage-cache.ts`.

export interface OutboxStatus {
  online: boolean;
  pendingCount: number;
  failedCount: number;
  draining: boolean;
}

interface DrainState {
  draining: boolean;
  pendingDrain: boolean;
  listenersAttached: boolean;
  lastStatus: OutboxStatus;
}

const initialStatus = (): OutboxStatus => ({
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  pendingCount: 0,
  failedCount: 0,
  draining: false,
});

export const drainState: DrainState = {
  draining: false,
  pendingDrain: false,
  listenersAttached: false,
  lastStatus: initialStatus(),
};

export const drainSubscribers = new Set<(s: OutboxStatus) => void>();

export const __resetDrainForTests = (): void => {
  drainState.draining = false;
  drainState.pendingDrain = false;
  drainState.listenersAttached = false;
  drainState.lastStatus = initialStatus();
  drainSubscribers.clear();
};
