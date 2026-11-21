import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { OutboxStatus } from '@/lib/outbox/drain-state';

const useOutboxStatusMock = vi.fn<() => OutboxStatus>();
const status = (over: Partial<OutboxStatus> = {}): OutboxStatus => ({
  online: true,
  pendingCount: 0,
  failedCount: 0,
  conflictCount: 0,
  draining: false,
  timerDrain: false,
  queueUnreadable: false,
  ...over,
});
const retryFailedMock = vi.fn();
const discardFailedMock = vi.fn();
const invalidateQueriesMock = vi.fn();
const captureExceptionMock = vi.fn();

vi.mock('@/lib/outbox', () => ({
  useOutboxStatus: () => useOutboxStatusMock(),
  retryFailed: (...args: unknown[]) => retryFailedMock(...args),
  discardFailed: (...args: unknown[]) => discardFailedMock(...args),
}));

vi.mock('@/lib/queryClient', () => ({
  queryClient: { invalidateQueries: () => invalidateQueriesMock() },
}));
vi.mock('@/lib/platform/telemetry', () => ({
  captureException: (...args: unknown[]) => captureExceptionMock(...args),
}));

const { OfflineIndicator } = await import('./OfflineIndicator');

afterEach(() => {
  useOutboxStatusMock.mockReset();
  retryFailedMock.mockReset();
  discardFailedMock.mockReset();
  invalidateQueriesMock.mockReset();
  captureExceptionMock.mockReset();
});

describe('OfflineIndicator', () => {
  it('renders nothing when online + idle', () => {
    useOutboxStatusMock.mockReturnValue(status());
    const { container } = render(<OfflineIndicator />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the offline state with pending count', () => {
    useOutboxStatusMock.mockReturnValue(status({ online: false, pendingCount: 3 }));
    render(<OfflineIndicator />);
    expect(screen.getByRole('status')).toHaveTextContent(/Offline · 3 pending/);
  });

  it('shows a syncing dot when draining', () => {
    useOutboxStatusMock.mockReturnValue(status({ pendingCount: 1 }));
    const { rerender } = render(<OfflineIndicator />);
    expect(screen.getByRole('status')).toHaveTextContent(/Sync queued · 1/);
    useOutboxStatusMock.mockReturnValue(status({ pendingCount: 1, draining: true }));
    rerender(<OfflineIndicator />);
    expect(screen.getByRole('status')).toHaveTextContent(/Syncing/);
  });

  it('never renders "Sync queued · 0" when a timer drain finds an emptied queue', () => {
    // Another tab can drain the entry while this tab's retry timer is armed;
    // the timer drain then starts with zero pending. The old "Syncing…" text
    // is the only honest label for that emit.
    useOutboxStatusMock.mockReturnValue(status({ draining: true, timerDrain: true }));
    render(<OfflineIndicator />);
    expect(screen.getByRole('status')).toHaveTextContent(/Syncing/);
  });

  it('keeps the live-region text steady across a timer-driven re-drain (#409)', () => {
    // One backoff cycle. The polite live region re-announces on any text
    // change, so all three emits must render the same text.
    const cycle = [
      { draining: false, timerDrain: false },
      { draining: true, timerDrain: true },
      { draining: false, timerDrain: false },
    ];
    useOutboxStatusMock.mockReturnValue(status({ pendingCount: 2, ...cycle[0] }));
    const { rerender } = render(<OfflineIndicator />);
    const initialText = screen.getByRole('status').textContent;
    expect(initialText).toContain('Sync queued · 2');
    for (const step of cycle.slice(1)) {
      useOutboxStatusMock.mockReturnValue(status({ pendingCount: 2, ...step }));
      rerender(<OfflineIndicator />);
      expect(screen.getByRole('status').textContent).toBe(initialText);
    }
  });

  // The counts a failed read keeps are stale, so a Retry cannot act on them
  // and "synced" would be a lie (#462).
  it('names an unreadable queue ahead of every other state', () => {
    useOutboxStatusMock.mockReturnValue(status({ failedCount: 1, queueUnreadable: true }));
    render(<OfflineIndicator />);
    expect(screen.getByRole('status')).toHaveTextContent(/Sync is not working on this device/);
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('shows a failure pill with Retry + Discard', () => {
    useOutboxStatusMock.mockReturnValue(status({ failedCount: 2 }));
    render(<OfflineIndicator />);
    expect(screen.getByRole('status')).toHaveTextContent(/2 sync changes failed/);
    expect(screen.getByRole('status')).not.toHaveTextContent(/board changed/);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument();
  });

  it('names the conflict when a failed entry is one (#281)', () => {
    useOutboxStatusMock.mockReturnValue(status({ failedCount: 2, conflictCount: 1 }));
    render(<OfflineIndicator />);
    expect(screen.getByRole('status')).toHaveTextContent(/board changed on another device/);
  });

  it('Retry resets failed entries via retryFailed, not a plain drain kick (#277)', () => {
    useOutboxStatusMock.mockReturnValue(status({ failedCount: 2 }));
    retryFailedMock.mockResolvedValue(undefined);
    render(<OfflineIndicator />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    // A plain drain skips failed entries — kicking one here was the #277 bug.
    expect(retryFailedMock).toHaveBeenCalledTimes(1);
  });

  it('discards failed entries without kicking the drain (#31)', async () => {
    useOutboxStatusMock.mockReturnValue(status({ pendingCount: 1, failedCount: 1 }));
    discardFailedMock.mockResolvedValue(undefined);
    render(<OfflineIndicator />);
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(discardFailedMock).toHaveBeenCalledTimes(1));
    expect(retryFailedMock).not.toHaveBeenCalled();
  });

  it('Discard refetches, so the server value replaces the discarded edit (#677)', async () => {
    useOutboxStatusMock.mockReturnValue(status({ failedCount: 1 }));
    discardFailedMock.mockImplementation(async () => {
      expect(invalidateQueriesMock).not.toHaveBeenCalled();
    });
    render(<OfflineIndicator />);
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(invalidateQueriesMock).toHaveBeenCalledTimes(1));
  });

  it('reports a Discard that cannot read the queue (#677)', async () => {
    useOutboxStatusMock.mockReturnValue(status({ failedCount: 1 }));
    const unreadable = new Error('idb unreadable');
    discardFailedMock.mockRejectedValue(unreadable);
    render(<OfflineIndicator />);
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    await waitFor(() =>
      expect(captureExceptionMock).toHaveBeenCalledWith(unreadable, expect.anything()),
    );
    expect(invalidateQueriesMock).not.toHaveBeenCalled();
  });
});
