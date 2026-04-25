import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const useOutboxStatusMock = vi.fn();

vi.mock('@/lib/outbox', () => ({
  useOutboxStatus: () => useOutboxStatusMock(),
  kick: vi.fn(),
  peekEntries: vi.fn(),
  discardEntry: vi.fn(),
}));

const { OfflineIndicator } = await import('./OfflineIndicator');

afterEach(() => {
  useOutboxStatusMock.mockReset();
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
      draining: true,
    });
    render(<OfflineIndicator />);
    expect(screen.getByRole('status')).toHaveTextContent(/Syncing/);
  });

  it('shows a failure pill with Retry + Discard', () => {
    useOutboxStatusMock.mockReturnValue({
      online: true,
      pendingCount: 0,
      failedCount: 2,
      draining: false,
    });
    render(<OfflineIndicator />);
    expect(screen.getByRole('status')).toHaveTextContent(/2 sync changes failed/);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument();
  });
});
