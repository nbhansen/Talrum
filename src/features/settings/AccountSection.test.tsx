import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const signOutMock = vi.fn<() => Promise<{ error: Error | null }>>(() =>
  Promise.resolve({ error: null }),
);

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { signOut: signOutMock } },
}));

const { TestSessionProvider } = await import('@/lib/auth/session.test-utils');
const { AccountSection } = await import('./AccountSection');

describe('AccountSection', () => {
  it('shows the signed-in email', () => {
    render(
      <TestSessionProvider>
        <AccountSection />
      </TestSessionProvider>,
    );
    expect(screen.getByText('parent@example.com')).toBeInTheDocument();
  });

  it('clicking Sign out calls supabase.auth.signOut', async () => {
    signOutMock.mockClear();
    render(
      <TestSessionProvider>
        <AccountSection />
      </TestSessionProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: /^sign out$/i }));
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });

  it('shows an error and enables the button again when sign-out fails (#645)', async () => {
    signOutMock.mockResolvedValueOnce({ error: new Error('Failed to fetch') });
    render(
      <TestSessionProvider>
        <AccountSection />
      </TestSessionProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: /^sign out$/i }));
    expect(
      await screen.findByText('Could not sign out. Check your connection and try again.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^sign out$/i })).toBeEnabled();
  });
});
