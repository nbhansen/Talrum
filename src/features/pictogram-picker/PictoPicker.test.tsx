import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSX, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TestSessionProvider } from '@/lib/auth/session.test-utils';
import { pictogramsQueryKey } from '@/lib/queries/pictograms';
import type { Pictogram } from '@/types/domain';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signOut: vi.fn(),
      getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  },
}));

const { PictoPicker } = await import('./PictoPicker');

const SEED_PICTOGRAMS: Pictogram[] = [
  { id: 'p-apple', slug: 'apple', label: 'Apple', style: 'illus', glyph: 'heart', tint: '#fff' },
  { id: 'p-cup', slug: 'cup', label: 'Cup', style: 'illus', glyph: 'heart', tint: '#fff' },
  { id: 'p-shoes', slug: 'shoes', label: 'Shoes', style: 'illus', glyph: 'heart', tint: '#fff' },
];

const wrap = (children: ReactNode): JSX.Element => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(pictogramsQueryKey, SEED_PICTOGRAMS);
  return (
    <TestSessionProvider>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </TestSessionProvider>
  );
};

describe('PictoPicker', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders the library tab by default with all seed pictograms', () => {
    render(wrap(<PictoPicker onClose={vi.fn()} />));
    expect(screen.getByRole('heading', { name: 'Add pictograms' })).toBeInTheDocument();
    expect(screen.getByText('Apple')).toBeInTheDocument();
    expect(screen.getByText('Cup')).toBeInTheDocument();
    expect(screen.getByText('Shoes')).toBeInTheDocument();
  });

  it('switches between library, upload, and generate tabs', async () => {
    const user = userEvent.setup();
    render(wrap(<PictoPicker onClose={vi.fn()} />));
    const tablist = screen.getByRole('tablist');
    const libraryTab = within(tablist).getByRole('tab', { name: /Library/ });
    const uploadTab = within(tablist).getByRole('tab', { name: /Upload/ });
    const generateTab = within(tablist).getByRole('tab', { name: /Generate/ });

    expect(libraryTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByPlaceholderText(/Search eat, dress/)).toBeInTheDocument();

    await user.click(uploadTab);
    expect(uploadTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByPlaceholderText(/Search eat, dress/)).not.toBeInTheDocument();

    await user.click(generateTab);
    expect(generateTab).toHaveAttribute('aria-selected', 'true');

    await user.click(libraryTab);
    expect(libraryTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByPlaceholderText(/Search eat, dress/)).toBeInTheDocument();
  });

  it('toggles selection and reflects the count + label in the footer', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(wrap(<PictoPicker onClose={onClose} onConfirm={onConfirm} />));

    expect(screen.getByText('0 selected')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Apple' }));
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add 1 to board/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cup' }));
    expect(screen.getByText('2 selected')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Apple' }));
    expect(screen.getByText('1 selected')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Add 1 to board/ }));
    expect(onConfirm).toHaveBeenCalledWith(['p-cup']);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('filters the library by search query', async () => {
    const user = userEvent.setup();
    render(wrap(<PictoPicker onClose={vi.fn()} />));
    await user.type(screen.getByPlaceholderText(/Search eat, dress/), 'app');
    expect(screen.getByText('Apple')).toBeInTheDocument();
    expect(screen.queryByText('Cup')).not.toBeInTheDocument();
    expect(screen.queryByText('Shoes')).not.toBeInTheDocument();
  });
});
