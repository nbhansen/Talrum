import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/queries/account', () => ({
  useDeleteMyAccount: () => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    isSuccess: false,
    error: null,
  }),
  DeleteAccountError: class extends Error {},
}));

const { DeleteAccountSection } = await import('./DeleteAccountSection');

describe('DeleteAccountSection', () => {
  const renderIt = (): void => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter
          initialEntries={['/settings']}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <Routes>
            <Route path="/settings" element={<DeleteAccountSection />} />
            <Route path="/account-deleted" element={<div data-testid="deleted" />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  };

  it('renders the destructive trigger', () => {
    renderIt();
    expect(screen.getByRole('button', { name: /delete my account/i })).toBeInTheDocument();
  });

  it('clicking opens the dialog', async () => {
    renderIt();
    await userEvent.click(screen.getByRole('button', { name: /delete my account/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('links to the privacy policy', () => {
    renderIt();
    const link = screen.getByRole('link', { name: /privacy policy/i });
    expect(link.getAttribute('href')).toBe('/privacy-policy');
  });
});
