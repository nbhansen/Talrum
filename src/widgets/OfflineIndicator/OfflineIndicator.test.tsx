import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const useOutboxStatusMock = vi.fn();
const retryFailedMock = vi.fn();
const peekEntriesMock = vi.fn();
const discardEntryMock = vi.fn();

vi.mock('@/lib/outbox', () => ({
  useOutboxStatus: () => useOutboxStatusMock(),
  retryFailed: (...args: unknown[]) => retryFailedMock(...args),
  peekEntries: (...args: unknown[]) => peekEntriesMock(...args),
  discardEntry: (...args: unknown[]) => discardEntryMock(...args),
}));

const { OfflineIndicator } = await import('./OfflineIndicator');

afterEach(() => {
  useOutboxStatusMock.mockReset();
  retryFailedMock.mockReset();
  peekEntriesMock.mockReset();
  discardEntryMock.mockReset();
});

describe('OfflineIndicator', () => {
  it('renders nothing when online + idle', () => {
    useOutboxStatusMock.mockReturnValue({
      online: true,
      pendingCount: 0,
      failedCount: 0,
      draining: false,
    });
    const { container } = render(<OfflineIndicator />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the offline state with pending count', () => {
    useOutboxStatusMock.mockReturnValue({
      online: false,
      pendingCount: 3,
      failedCount: 0,
      draining: false,
    });
    render(<OfflineIndicator />);
    expect(screen.getByRole('status')).toHaveTextContent(/Offline · 3 pending/);
  });

  it('shows a syncing dot when draining', () => {
    useOutboxStatusMock.mockReturnValue({
      online: true,
      pendingCount: 1,
      failedCount: 0,
      draining: false,
      timerDrain: false,
    });
    const { rerender } = render(<OfflineIndicator />);
    expect(screen.getByRole('status')).toHaveTextContent(/Sync queued · 1/);
    useOutboxStatusMock.mockReturnValue({
      online: true,
      pendingCount: 1,
      failedCount: 0,
      draining: true,
      timerDrain: false,
    });
    rerender(<OfflineIndicator />);
    expect(screen.getByRole('status')).toHaveTextContent(/Syncing/);
  });

  it('keeps the live-region text steady across a timer-driven re-drain (#409)', () => {
    // Walk one backoff cycle of a transient outage: queued (timer armed) →
    // timer drain running → transient again, queued. The polite live region
    // re-announces on any text change, so all three must render the same
    // text — only a user- or event-driven drain may say "Syncing…".
    const cycle = [
      { draining: false, timerDrain: false },
      { draining: true, timerDrain: true },
      { draining: false, timerDrain: false },
    ];
    useOutboxStatusMock.mockReturnValue({
      online: true,
      pendingCount: 2,
      failedCount: 0,
      ...cycle[0],
    });
    const { rerender } = render(<OfflineIndicator />);
    const initialText = screen.getByRole('status').textContent;
    expect(initialText).toContain('Sync queued · 2');
    for (const step of cycle.slice(1)) {
      useOutboxStatusMock.mockReturnValue({
        online: true,
        pendingCount: 2,
        failedCount: 0,
        ...step,
      });
      rerender(<OfflineIndicator />);
      expect(screen.getByRole('status').textContent).toBe(initialText);
    }
  });

  it('shows a failure pill with Retry + Discard', () => {
    useOutboxStatusMock.mockReturnValue({
      online: true,
      pendingCount: 0,
      failedCount: 2,
      conflictCount: 0,
      draining: false,
    });
    render(<OfflineIndicator />);
    expect(screen.getByRole('status')).toHaveTextContent(/2 sync changes failed/);
    expect(screen.getByRole('status')).not.toHaveTextContent(/board changed/);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument();
  });

  it('names the conflict when a failed entry is one (#281)', () => {
    useOutboxStatusMock.mockReturnValue({
      online: true,
      pendingCount: 0,
      failedCount: 2,
      conflictCount: 1,
      draining: false,
    });
    render(<OfflineIndicator />);
    expect(screen.getByRole('status')).toHaveTextContent(/board changed on another device/);
  });

  it('Retry resets failed entries via retryFailed, not a plain drain kick (#277)', () => {
    useOutboxStatusMock.mockReturnValue({
      online: true,
      pendingCount: 0,
      failedCount: 2,
      draining: false,
    });
    retryFailedMock.mockResolvedValue(undefined);
    render(<OfflineIndicator />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    // A plain drain skips failed entries — kicking one here was the #277 bug.
    expect(retryFailedMock).toHaveBeenCalledTimes(1);
  });

  it('discards failed entries without kicking the drain (#31)', async () => {
    useOutboxStatusMock.mockReturnValue({
      online: true,
      pendingCount: 1,
      failedCount: 1,
      draining: false,
    });
    peekEntriesMock.mockResolvedValue([
      { id: 'a', status: 'failed' },
      { id: 'b', status: 'pending' },
    ]);
    discardEntryMock.mockResolvedValue(undefined);
    render(<OfflineIndicator />);
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(discardEntryMock).toHaveBeenCalledWith('a'));
    expect(discardEntryMock).not.toHaveBeenCalledWith('b');
    expect(retryFailedMock).not.toHaveBeenCalled();
  });
});
