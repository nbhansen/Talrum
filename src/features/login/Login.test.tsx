import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const signInWithOtpMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { signInWithOtp: signInWithOtpMock },
  },
}));

const { Login } = await import('./Login');

afterEach(() => {
  signInWithOtpMock.mockReset();
});

describe('Login', () => {
  it('starts on the email step with a Send link button', () => {
    render(<Login />);
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send link' })).toBeInTheDocument();
  });

  it('submitting an email sends a magic link redirecting back to the app, then confirms', async () => {
    signInWithOtpMock.mockResolvedValueOnce({ error: null });
    render(<Login />);
    await userEvent.type(screen.getByLabelText('Email'), 'parent@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send link' }));
    expect(signInWithOtpMock).toHaveBeenCalledWith({
      email: 'parent@example.com',
      options: { shouldCreateUser: true, emailRedirectTo: window.location.origin },
    });
    // Advances to the confirmation step naming the address it was sent to.
    expect(await screen.findByText(/Check your email/)).toBeInTheDocument();
    expect(screen.getByText('parent@example.com')).toBeInTheDocument();
  });

  it('shows the API error when sending fails and stays on the email step', async () => {
    signInWithOtpMock.mockResolvedValueOnce({ error: { message: 'rate limit hit' } });
    render(<Login />);
    await userEvent.type(screen.getByLabelText('Email'), 'parent@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send link' }));
    expect(await screen.findByText('rate limit hit')).toBeInTheDocument();
    expect(screen.queryByText(/Check your email/)).not.toBeInTheDocument();
  });

  it('Use a different email returns to the email step', async () => {
    signInWithOtpMock.mockResolvedValueOnce({ error: null });
    render(<Login />);
    await userEvent.type(screen.getByLabelText('Email'), 'parent@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send link' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Use a different email' }));
    expect(screen.getByRole('button', { name: 'Send link' })).toBeInTheDocument();
  });
});
