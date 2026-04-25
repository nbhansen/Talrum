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

  it('submitting an email calls signInWithOtp and advances to the OTP step', async () => {
    signInWithOtpMock.mockResolvedValueOnce({ error: null });
    render(<Login />);
    await userEvent.type(screen.getByLabelText('Email'), 'parent@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send code' }));
    expect(signInWithOtpMock).toHaveBeenCalledWith({
      email: 'parent@example.com',
      options: { shouldCreateUser: true },
    });
    expect(await screen.findByLabelText('Code')).toBeInTheDocument();
  });

  it('shows the API error when sending the code fails and stays on the email step', async () => {
    signInWithOtpMock.mockResolvedValueOnce({ error: { message: 'rate limit hit' } });
    render(<Login />);
    await userEvent.type(screen.getByLabelText('Email'), 'parent@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send code' }));
    expect(await screen.findByText('rate limit hit')).toBeInTheDocument();
    expect(screen.queryByLabelText('Code')).not.toBeInTheDocument();
  });

  it('submitting a 6-digit code calls verifyOtp', async () => {
    signInWithOtpMock.mockResolvedValueOnce({ error: null });
    verifyOtpMock.mockResolvedValueOnce({ error: null });
    render(<Login />);
    await userEvent.type(screen.getByLabelText('Email'), 'parent@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send code' }));
    await screen.findByLabelText('Code');
    await userEvent.type(screen.getByLabelText('Code'), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(verifyOtpMock).toHaveBeenCalledWith({
      email: 'parent@example.com',
      token: '123456',
      type: 'email',
    });
  });

  it('non-numeric input is stripped from the OTP field', async () => {
    signInWithOtpMock.mockResolvedValueOnce({ error: null });
    render(<Login />);
    await userEvent.type(screen.getByLabelText('Email'), 'parent@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send code' }));
    const otp = (await screen.findByLabelText('Code')) as HTMLInputElement;
    await userEvent.type(otp, 'abc12def34');
    expect(otp.value).toBe('1234');
  });

  it('Back from the OTP step returns to the email step and clears errors', async () => {
    signInWithOtpMock.mockResolvedValueOnce({ error: null });
    render(<Login />);
    await userEvent.type(screen.getByLabelText('Email'), 'parent@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send code' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Back' }));
    expect(screen.getByRole('button', { name: 'Send code' })).toBeInTheDocument();
  });
});
