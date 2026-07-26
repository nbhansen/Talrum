import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { hasPin, setPin } from '@/lib/pin';

import { PinManagementSection } from './PinManagementSection';

const enterPin = async (user: ReturnType<typeof userEvent.setup>, pin: string): Promise<void> => {
  for (const digit of pin) {
    await user.click(screen.getByRole('button', { name: digit }));
  }
};

beforeEach(() => {
  window.localStorage.removeItem('talrum:pin-hash');
});

describe('PinManagementSection', () => {
  // A test here used to walk this whole flow just to assert console.error was
  // never called on the enter-new→confirm-new transition: PinPad.tap() once
  // called submit() from inside a setDigits updater, which schedules a setState
  // on this section mid-render and makes React log. That is now enforced for
  // every test by the console.error guard in vitest.setup.ts (#387) — the walk
  // below trips the same transition, so the regression is still covered, just
  // without a five-second test to time out.
  it('shows the no-PIN message when no PIN is set', () => {
    render(<PinManagementSection />);
    expect(screen.getByText(/No PIN set, so kid mode is unavailable/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /change pin/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /clear pin/i })).not.toBeInTheDocument();
  });

  // #353 removed PIN setup from the kid-mode exit gate, which was the only way
  // to create one. Without this button there is no way to set a PIN at all, and
  // therefore no way to use kid mode.
  it('offers Set a PIN when none is set, and setting one enables kid mode (#353)', async () => {
    const user = userEvent.setup();
    render(<PinManagementSection />);

    await user.click(screen.getByRole('button', { name: /set a pin/i }));
    expect(await screen.findByText(/Set a parent PIN/i)).toBeInTheDocument();

    await enterPin(user, '4321');
    expect(await screen.findByText(/Confirm your PIN/i)).toBeInTheDocument();

    await enterPin(user, '4321');
    expect(await screen.findByText(/PIN set — kid mode is ready/i)).toBeInTheDocument();

    expect(hasPin()).toBe(true);
    const { verifyPin } = await import('@/lib/pin');
    expect(await verifyPin('4321')).toBe(true);
  });

  it('first-time setup rejects a mismatched confirmation and stores nothing', async () => {
    const user = userEvent.setup();
    render(<PinManagementSection />);

    await user.click(screen.getByRole('button', { name: /set a pin/i }));
    await enterPin(user, '4321');
    await enterPin(user, '9999');

    expect(await screen.findByText(/PINs don't match/i)).toBeInTheDocument();
    expect(hasPin()).toBe(false);
  });

  it('explains the redirect when a kid route bounced the parent here (#353)', () => {
    render(<PinManagementSection pinRequiredForKidMode />);
    expect(screen.getByRole('status')).toHaveTextContent(/Kid mode needs a parent PIN/i);
  });

  it('does not show the kid-mode notice once a PIN exists', async () => {
    await setPin('1234');
    render(<PinManagementSection pinRequiredForKidMode />);
    expect(screen.queryByText(/Kid mode needs a parent PIN/i)).not.toBeInTheDocument();
  });

  it('shows Change PIN and Clear PIN when a PIN is set', async () => {
    await setPin('1234');
    render(<PinManagementSection />);
    expect(screen.getByRole('button', { name: /change pin/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clear pin/i })).toBeInTheDocument();
  });

  it('clears the PIN through the inline confirm flow', async () => {
    const user = userEvent.setup();
    await setPin('1234');
    render(<PinManagementSection />);

    await user.click(screen.getByRole('button', { name: /clear pin/i }));
    await user.click(screen.getByRole('button', { name: /yes, clear/i }));

    expect(hasPin()).toBe(false);
    expect(await screen.findByText(/PIN cleared/i)).toBeInTheDocument();
  });

  it('cancel during clear-confirm leaves the PIN intact', async () => {
    const user = userEvent.setup();
    await setPin('1234');
    render(<PinManagementSection />);

    await user.click(screen.getByRole('button', { name: /clear pin/i }));
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(hasPin()).toBe(true);
  });

  it('change-PIN happy path: verify old → enter new → confirm → setPin called', async () => {
    const user = userEvent.setup();
    await setPin('1234');
    render(<PinManagementSection />);

    await user.click(screen.getByRole('button', { name: /change pin/i }));
    expect(await screen.findByText(/Enter current PIN/i)).toBeInTheDocument();

    await enterPin(user, '1234');
    expect(await screen.findByText(/Enter new PIN/i)).toBeInTheDocument();

    await enterPin(user, '5678');
    expect(await screen.findByText(/Confirm new PIN/i)).toBeInTheDocument();

    await enterPin(user, '5678');
    expect(await screen.findByText(/PIN updated/i)).toBeInTheDocument();

    const { verifyPin } = await import('@/lib/pin');
    expect(await verifyPin('1234')).toBe(false);
    expect(await verifyPin('5678')).toBe(true);
  });

  it('shows error and stays on confirm step when new PINs do not match', async () => {
    const user = userEvent.setup();
    await setPin('1234');
    render(<PinManagementSection />);

    await user.click(screen.getByRole('button', { name: /change pin/i }));
    await enterPin(user, '1234');
    await enterPin(user, '5678');
    await enterPin(user, '9999');

    expect(await screen.findByText(/PINs don't match/i)).toBeInTheDocument();
    const { verifyPin } = await import('@/lib/pin');
    expect(await verifyPin('1234')).toBe(true);
  });

  it('stays on the verify step when the current PIN is wrong', async () => {
    const user = userEvent.setup();
    await setPin('1234');
    render(<PinManagementSection />);

    await user.click(screen.getByRole('button', { name: /change pin/i }));
    await enterPin(user, '0000');

    expect(await screen.findByText(/Wrong PIN/i)).toBeInTheDocument();
    expect(screen.getByText(/Enter current PIN/i)).toBeInTheDocument();
    expect(screen.queryByText(/Enter new PIN/i)).not.toBeInTheDocument();
  });
});
