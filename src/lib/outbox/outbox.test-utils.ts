import type { UpdateBoardEntry } from './types';

export const baseEntry = (over: Partial<UpdateBoardEntry> = {}): UpdateBoardEntry => ({
  id: '01HZZZZZZZZZZZZZZZZZZZZZZZ',
  kind: 'updateBoard',
  boardId: 'board-1',
  patch: { name: 'New name' },
  enqueuedAt: 0,
  attemptCount: 0,
  status: 'pending',
  ...over,
});

export const closed = (): DOMException => new DOMException('Closed', 'InvalidStateError');

export const setOnline = (value: boolean): void => {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
};

// One real macrotask, for tests that fake setTimeout. MessageChannel, not
// setTimeout: fake-indexeddb settles on real macrotasks that a fake clock
// never reaches.
export const realTick = (): Promise<void> =>
  new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });
