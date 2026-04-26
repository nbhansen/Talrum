import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { TestSessionProvider } from '@/lib/auth/session.test-utils';
import type { Kid } from '@/types/domain';

vi.mock('@/lib/queries/kids', () => ({
  useKids: (): { data: Kid[]; isPending: boolean } => ({
    data: [{ id: 'k1', ownerId: 'owner', name: 'Liam' }],
    isPending: false,
  }),
  useCreateKid: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signOut: vi.fn(),
      getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  },
}));

const { KidsRoute } = await import('./KidsRoute');

const renderRoute = (): void => {
  render(
    <TestSessionProvider>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <KidsRoute />
      </MemoryRouter>
    </TestSessionProvider>,
  );
};

describe('KidsRoute', () => {
  it('renders the Kids shell with rows from the cache', () => {
    renderRoute();
    expect(screen.getByRole('heading', { name: 'Kids' })).toBeInTheDocument();
    expect(screen.getByText('Liam')).toBeInTheDocument();
  });

  it('clicking the header New kid opens the modal', async () => {
    renderRoute();
    expect(screen.queryByRole('heading', { name: /add a kid/i })).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /new kid/i }));

    expect(screen.getByRole('heading', { name: /add a kid/i })).toBeInTheDocument();
  });
});
