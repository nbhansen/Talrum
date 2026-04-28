import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useDeleteMyAccountSpy = vi.fn<(opts?: { onPreSignOut?: () => void }) => unknown>();

vi.mock('@/lib/queries/account', () => ({
  useDeleteMyAccount: (opts?: { onPreSignOut?: () => void }) => {
    useDeleteMyAccountSpy(opts);
    return {
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      isSuccess: false,
      error: null,
    };
  },
  DeleteAccountError: class extends Error {},
}));

const { DeleteAccountSection } = await import('./DeleteAccountSection');

describe('DeleteAccountSection', () => {
  beforeEach(() => {
    useDeleteMyAccountSpy.mockReset();
  });

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

  // The section's whole reason for existing on this branch is to wire a
  // navigate() into onPreSignOut. If the option goes missing, the user
  // lands on Login after deletion (the Phase G AuthGate race).
  it('passes onPreSignOut to useDeleteMyAccount when the dialog opens', async () => {
    renderIt();
    await userEvent.click(screen.getByRole('button', { name: /delete my account/i }));
    expect(useDeleteMyAccountSpy).toHaveBeenCalled();
    const lastCallArg = useDeleteMyAccountSpy.mock.calls.at(-1)?.[0];
    expect(typeof lastCallArg?.onPreSignOut).toBe('function');
  });
});
