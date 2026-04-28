import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const signOutMock = vi.fn(() => Promise.resolve({ error: null }));

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
});
