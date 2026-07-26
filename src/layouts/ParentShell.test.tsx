import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const useOutboxStatusMock = vi.fn();

vi.mock('@/lib/outbox', () => ({
  useOutboxStatus: () => useOutboxStatusMock(),
  retryFailed: vi.fn(),
  peekEntries: vi.fn(),
  discardEntry: vi.fn(),
}));

const { ParentShell } = await import('./ParentShell');

const clean = { online: true, pendingCount: 0, failedCount: 0, conflictCount: 0, draining: false };
const failed = { online: true, pendingCount: 0, failedCount: 2, conflictCount: 0, draining: false };
const offline = {
  online: false,
  pendingCount: 1,
  failedCount: 0,
  conflictCount: 0,
  draining: false,
};

afterEach(() => {
  useOutboxStatusMock.mockReset();
});

describe('ParentShell sync status (#354)', () => {
  // The bug: <OfflineIndicator /> lived inside the header, which only renders
  // when a screen passes a `title`. The board builder passes none, so the one
  // screen where nearly every write is made was the one screen that could not
  // report a failed one — and Retry/Discard exist nowhere else.
  it.each([
    ['without a title (board builder)', undefined],
    ['with a title', 'Boards'],
  ])('surfaces a failed sync %s', (_case, title) => {
    useOutboxStatusMock.mockReturnValue(failed);
    render(
      <ParentShell {...(title ? { title } : {})}>
        <div />
      </ParentShell>,
    );

    expect(screen.getByRole('status')).toHaveTextContent(/2 sync changes failed/i);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument();
  });

  it('surfaces the offline state on a screen with no title', () => {
    useOutboxStatusMock.mockReturnValue(offline);
    render(
      <ParentShell>
        <div />
      </ParentShell>,
    );

    expect(screen.getByRole('status')).toHaveTextContent(/offline/i);
  });

  it('says nothing when online with a clean outbox', () => {
    useOutboxStatusMock.mockReturnValue(clean);
    render(
      <ParentShell title="Boards">
        <div />
      </ParentShell>,
    );

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('still renders the header content it is given', () => {
    useOutboxStatusMock.mockReturnValue(clean);
    render(
      <ParentShell title="Library" subtitle="Every pictogram" right={<button>Add</button>}>
        <div data-testid="page" />
      </ParentShell>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Library' })).toBeInTheDocument();
    expect(screen.getByText('Every pictogram')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
    expect(screen.getByTestId('page')).toBeInTheDocument();
  });

  it('omits the header entirely when a screen brings its own', () => {
    useOutboxStatusMock.mockReturnValue(clean);
    const { container } = render(
      <ParentShell>
        <div data-testid="page" />
      </ParentShell>,
    );

    expect(container.querySelector('header')).toBeNull();
    expect(screen.getByTestId('page')).toBeInTheDocument();
  });
});
