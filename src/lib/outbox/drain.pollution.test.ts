import { describe, expect, it } from 'vitest';

import { putEntry } from './store';
import type { UpdateBoardEntry } from './types';

const { getStatus, refreshStatus, subscribeStatus } = await import('./drain');

const baseEntry = (over: Partial<UpdateBoardEntry> = {}): UpdateBoardEntry => ({
  id: '01HZZZZZZZZZZZZZZZZZZZZZZZ',
  kind: 'updateBoard',
  boardId: 'board-1',
  patch: { name: 'New name' },
  enqueuedAt: 0,
  attemptCount: 0,
  status: 'pending',
  ...over,
});

describe('drain module-state cross-test isolation', () => {
  it('first test populates lastStatus and leaves a subscriber registered', async () => {
    await putEntry(baseEntry({ id: '01HZZA' }));
    subscribeStatus(() => {
      // Intentionally never unsubscribed — proves the global afterEach clears
      // the subscribers Set even when a test forgets to clean up.
    });
    await refreshStatus();
    expect(getStatus().pendingCount).toBe(1);
  });

  it('second test must see clean lastStatus and an empty subscriber set', () => {
    expect(getStatus().pendingCount).toBe(0);

    let pushes = 0;
    const unsub = subscribeStatus(() => {
      pushes += 1;
    });
    // subscribeStatus pushes lastStatus to the new subscriber synchronously.
    // If the prior subscriber leaked, the Set still contains it but that's
    // not directly observable here — pendingCount === 0 is the load-bearing
    // assertion. Counting our own pushes guards against subscribeStatus
    // regressing its initial-emit contract.
    expect(pushes).toBe(1);
    unsub();
  });
});
