import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/queries/account', () => ({
  useDeleteMyAccount: (onPreSignOut: () => void) => ({
    mutate: onPreSignOut,
    isPending: false,
    isError: false,
    isSuccess: false,
    error: null,
  }),
}));

const { DeleteAccountSection } = await import('./DeleteAccountSection');

describe('DeleteAccountSection', () => {
  const renderIt = (): void => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <Routes>
          <Route path="/settings" element={<DeleteAccountSection />} />
          <Route path="/account-deleted" element={<div data-testid="deleted" />} />
        </Routes>
      </MemoryRouter>,
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

  // Without this navigation the user lands on Login after the deletion.
  it('goes to the account-deleted page before the sign-out', async () => {
    renderIt();
    await userEvent.click(screen.getByRole('button', { name: /delete my account/i }));
    await userEvent.type(screen.getByLabelText(/type/i), 'delete my account');
    await userEvent.click(screen.getByRole('button', { name: /delete forever/i }));
    expect(screen.getByTestId('deleted')).toBeInTheDocument();
  });
});
