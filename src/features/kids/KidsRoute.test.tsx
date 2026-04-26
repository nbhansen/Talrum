import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { TestSessionProvider } from '@/lib/auth/session.test-utils';

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

describe('KidsRoute', () => {
  it('renders the Kids header and a coming-soon body', () => {
    render(
      <TestSessionProvider>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <KidsRoute />
        </MemoryRouter>
      </TestSessionProvider>,
    );
    expect(screen.getByRole('heading', { name: 'Kids' })).toBeInTheDocument();
    expect(screen.getByText(/coming in a future release/i)).toBeInTheDocument();
  });
});
