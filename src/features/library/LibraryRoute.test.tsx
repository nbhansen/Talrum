import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { TestSessionProvider } from '@/lib/auth/session.test-utils';
import type { Pictogram } from '@/types/domain';

vi.mock('@/lib/queries/pictograms', () => ({
  usePictograms: (): { data: Pictogram[]; isPending: boolean } => ({
    data: [{ id: 'p1', label: 'Apple', style: 'illus', glyph: 'apple', tint: '#ff0000' }],
    isPending: false,
  }),
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

const { LibraryRoute } = await import('./LibraryRoute');

describe('LibraryRoute', () => {
  it('renders the Library shell with pictograms from the cache', () => {
    render(
      <TestSessionProvider>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <LibraryRoute />
        </MemoryRouter>
      </TestSessionProvider>,
    );
    expect(screen.getByRole('heading', { name: 'Library' })).toBeInTheDocument();
    expect(screen.getByText('Apple')).toBeInTheDocument();
  });
});
