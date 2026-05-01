import { describe, expect, it } from 'vitest';

import { drainSubscribers } from './drain-state';
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
    // Direct probe: if the prior test's subscriber leaked, drainSubscribers
    // would still contain it. Asserting on the Set directly (rather than via
    // observable behavior) closes the gap that pendingCount alone can't see.
    expect(drainSubscribers.size).toBe(0);

    let pushes = 0;
    const unsub = subscribeStatus(() => {
      pushes += 1;
    });
    // subscribeStatus pushes lastStatus to the new subscriber synchronously.
    expect(pushes).toBe(1);
    expect(drainSubscribers.size).toBe(1);
    unsub();
  });
});
