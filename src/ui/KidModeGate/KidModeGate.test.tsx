import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearPin, hasPin, setPin, verifyPin } from '@/lib/pin';

import { KidModeGate } from './KidModeGate';

// `pinGateDisabled()` reads import.meta.env at runtime; tests run with the
// flag undefined, so the gate is active. We verify both the verify path
// (PIN already set) and the setup path (no PIN yet).

beforeEach(() => {
  // Defensive: localStorage is shared across tests in jsdom.
  clearPin();
});

afterEach(() => {
  clearPin();
  vi.restoreAllMocks();
});

const renderGate = (onExitConfirmed = vi.fn()): { user: ReturnType<typeof userEvent.setup> } => {
  const user = userEvent.setup();
  render(
    <KidModeGate onExitConfirmed={onExitConfirmed}>
      {(requestExit) => (
        <button type="button" onClick={requestExit}>
          Exit kid mode
        </button>
      )}
    </KidModeGate>,
  );
  return { user };
};

const tapDigits = async (
  user: ReturnType<typeof userEvent.setup>,
  digits: string,
): Promise<void> => {
  for (const d of digits) {
    await user.click(screen.getByRole('button', { name: d }));
  }
};

describe('KidModeGate', () => {
  // Must run first: React deduplicates the "Cannot update a component while
  // rendering a different component" warning per-process, so once any other
  // setup→confirm test trips it the regression test would silently pass.
  // PinPad.tap() used to call submit() from inside a setDigits updater; on
  // the setup→confirm transition that synchronously schedules a setState on
  // KidModeGate, which React flags via console.error. Fail if any
  // console.error fires on the setup→confirm happy path.
  it('does not emit React state-update warnings during setup→confirm transition', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onExit = vi.fn();
    const { user } = renderGate(onExit);

    await user.click(screen.getByRole('button', { name: 'Exit kid mode' }));
    await tapDigits(user, '1234');
    expect(await screen.findByText('Confirm your PIN')).toBeInTheDocument();
    await tapDigits(user, '1234');
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('skips the gate entirely when VITE_DISABLE_PIN is set', async () => {
    vi.stubEnv('VITE_DISABLE_PIN', '1');
    try {
      const onExit = vi.fn();
      const { user } = renderGate(onExit);
      await user.click(screen.getByRole('button', { name: 'Exit kid mode' }));
      // Modal never mounts; onExitConfirmed fires synchronously.
      expect(screen.queryByText(/Set a parent PIN/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Enter PIN to exit/)).not.toBeInTheDocument();
      expect(onExit).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('first exit with no PIN runs setup → confirm → fires onExitConfirmed', async () => {
    expect(hasPin()).toBe(false);
    const onExit = vi.fn();
    const { user } = renderGate(onExit);

    await user.click(screen.getByRole('button', { name: 'Exit kid mode' }));
    expect(screen.getByText('Set a parent PIN')).toBeInTheDocument();
    await tapDigits(user, '1234');

    expect(await screen.findByText('Confirm your PIN')).toBeInTheDocument();
    await tapDigits(user, '1234');

    expect(onExit).toHaveBeenCalledTimes(1);
    expect(hasPin()).toBe(true);
    expect(await verifyPin('1234')).toBe(true);
  });

  it('mismatched confirmation shows an error and keeps the modal open', async () => {
    const onExit = vi.fn();
    const { user } = renderGate(onExit);

    await user.click(screen.getByRole('button', { name: 'Exit kid mode' }));
    await tapDigits(user, '1234');
    await screen.findByText('Confirm your PIN');
    await tapDigits(user, '5678');

    expect(await screen.findByText("PINs don't match")).toBeInTheDocument();
    expect(onExit).not.toHaveBeenCalled();
    expect(hasPin()).toBe(false);
  });

  it('with PIN already set, verify path accepts the right digits', async () => {
    await setPin('9999');
    const onExit = vi.fn();
    const { user } = renderGate(onExit);

    await user.click(screen.getByRole('button', { name: 'Exit kid mode' }));
    expect(screen.getByText('Enter PIN to exit')).toBeInTheDocument();
    await tapDigits(user, '9999');

    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('verify path rejects wrong digits and lets the user retry', async () => {
    await setPin('9999');
    const onExit = vi.fn();
    const { user } = renderGate(onExit);

    await user.click(screen.getByRole('button', { name: 'Exit kid mode' }));
    await tapDigits(user, '1111');
    expect(await screen.findByText('Wrong PIN')).toBeInTheDocument();
    expect(onExit).not.toHaveBeenCalled();
  });
});
