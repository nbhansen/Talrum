import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const signInWithOtpMock = vi.fn();
const verifyOtpMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { signInWithOtp: signInWithOtpMock, verifyOtp: verifyOtpMock },
  },
}));

const { Login } = await import('./Login');

afterEach(() => {
  signInWithOtpMock.mockReset();
  verifyOtpMock.mockReset();
});

describe('Login', () => {
  it('starts on the email step with a Send code button', () => {
    render(<Login />);
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send code' })).toBeInTheDocument();
  });

  it('submitting an email sends a code email, then asks for the code', async () => {
    signInWithOtpMock.mockResolvedValueOnce({ error: null });
    render(<Login />);
    await userEvent.type(screen.getByLabelText('Email'), 'parent@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send code' }));
    expect(signInWithOtpMock).toHaveBeenCalledWith({
      email: 'parent@example.com',
      options: { shouldCreateUser: true },
    });
    // Advances to the confirmation step naming the address it was sent to.
    expect(await screen.findByText(/Check your email/)).toBeInTheDocument();
    expect(screen.getByText('parent@example.com')).toBeInTheDocument();
  });

  it('shows the API error when sending fails and stays on the email step', async () => {
    signInWithOtpMock.mockResolvedValueOnce({ error: { message: 'rate limit hit' } });
    render(<Login />);
    await userEvent.type(screen.getByLabelText('Email'), 'parent@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send code' }));
    expect(await screen.findByText('rate limit hit')).toBeInTheDocument();
    expect(screen.queryByText(/Check your email/)).not.toBeInTheDocument();
  });

  it('typing the emailed code signs in', async () => {
    signInWithOtpMock.mockResolvedValueOnce({ error: null });
    verifyOtpMock.mockResolvedValueOnce({ error: null });
    render(<Login />);
    await userEvent.type(screen.getByLabelText('Email'), 'parent@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send code' }));
    await userEvent.type(await screen.findByLabelText('Code'), '12 34-56');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(verifyOtpMock).toHaveBeenCalledWith({
      email: 'parent@example.com',
      token: '123456',
      type: 'email',
    });
  });

  it('shows the API error when the code is wrong and keeps the code step', async () => {
    signInWithOtpMock.mockResolvedValueOnce({ error: null });
    verifyOtpMock.mockResolvedValueOnce({ error: { message: 'Token has expired or is invalid' } });
    render(<Login />);
    await userEvent.type(screen.getByLabelText('Email'), 'parent@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send code' }));
    await userEvent.type(await screen.findByLabelText('Code'), '000000');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Token has expired or is invalid')).toBeInTheDocument();
    expect(screen.getByLabelText('Code')).toBeInTheDocument();
  });

  it('Use a different email returns to the email step', async () => {
    signInWithOtpMock.mockResolvedValueOnce({ error: null });
    render(<Login />);
    await userEvent.type(screen.getByLabelText('Email'), 'parent@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send code' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Use a different email' }));
    expect(screen.getByRole('button', { name: 'Send code' })).toBeInTheDocument();
  });
});
