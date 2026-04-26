import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { JSX } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TestSessionProvider } from '@/lib/auth/session.test-utils';
import { boardsQueryKey } from '@/lib/queries/boards';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
    }),
    auth: {
      signOut: vi.fn(),
      getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  },
}));

const { ParentHomeRoute } = await import('./ParentHomeRoute');

const makeWrap = (initialPath: string): (() => JSX.Element) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(boardsQueryKey, []);
  return (): JSX.Element => (
    <TestSessionProvider>
      <QueryClientProvider client={qc}>
        <MemoryRouter
          initialEntries={[initialPath]}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <Routes>
            <Route path="/" element={<ParentHomeRoute />} />
            <Route
              path="/kid/sequence/:boardId"
              element={<div data-testid="kid-sequence-route" />}
            />
            <Route path="/kid/choice/:boardId" element={<div data-testid="kid-choice-route" />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </TestSessionProvider>
  );
};

describe('ParentHomeRoute auto-launch', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('renders ParentHome when no last board is recorded', () => {
    const Wrap = makeWrap('/');
    render(<Wrap />);
    expect(screen.queryByTestId('kid-sequence-route')).not.toBeInTheDocument();
    expect(screen.queryByTestId('kid-choice-route')).not.toBeInTheDocument();
    // ParentHome's title is rendered via ParentShell when supplied.
    expect(screen.getByText(/Liam's boards/)).toBeInTheDocument();
  });

  it('redirects into the last sequence board on first visit per session', () => {
    localStorage.setItem('talrum:last-board', JSON.stringify({ id: 'b-seq', kind: 'sequence' }));
    const Wrap = makeWrap('/');
    render(<Wrap />);
    expect(screen.getByTestId('kid-sequence-route')).toBeInTheDocument();
  });

  it('redirects into the last choice board on first visit per session', () => {
    localStorage.setItem('talrum:last-board', JSON.stringify({ id: 'b-cho', kind: 'choice' }));
    const Wrap = makeWrap('/');
    render(<Wrap />);
    expect(screen.getByTestId('kid-choice-route')).toBeInTheDocument();
  });

  it('does not redirect when the session has already auto-launched', () => {
    localStorage.setItem('talrum:last-board', JSON.stringify({ id: 'b-seq', kind: 'sequence' }));
    sessionStorage.setItem('talrum:auto-launched', '1');
    const Wrap = makeWrap('/');
    render(<Wrap />);
    expect(screen.queryByTestId('kid-sequence-route')).not.toBeInTheDocument();
    expect(screen.getByText(/Liam's boards/)).toBeInTheDocument();
  });
});
