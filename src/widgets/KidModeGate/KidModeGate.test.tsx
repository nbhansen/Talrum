import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearPin, hasPin, setPin } from '@/lib/pin';

import { KidModeGate } from './KidModeGate';
import { recordPinFailure, resetPinThrottle } from './pinThrottle';

// `pinGateDisabled()` reads import.meta.env at runtime; tests run with the
// flag undefined, so the gate is active.

beforeEach(() => {
  // Defensive: localStorage is shared across tests in jsdom, and the
  // throttle counter is module state shared the same way.
  clearPin();
  resetPinThrottle();
});

afterEach(() => {
  // Unmount before resetting the throttle: this afterEach runs before RTL's
  // auto-cleanup, and the reset notifies a still-mounted gate outside act.
  cleanup();
  clearPin();
  resetPinThrottle();
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
  it('skips the gate entirely when VITE_DISABLE_PIN is set', async () => {
    vi.stubEnv('VITE_DISABLE_PIN', '1');
    try {
      const onExit = vi.fn();
      const { user } = renderGate(onExit);
      await user.click(screen.getByRole('button', { name: 'Exit kid mode' }));
      // Modal never mounts; onExitConfirmed fires synchronously.
      expect(screen.queryByText(/Enter PIN to exit/)).not.toBeInTheDocument();
      expect(onExit).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  // The bug in #353: the gate used to open a two-step *setup* flow here, so
  // whoever held the tablet could invent a PIN and walk out. Nothing in the
  // gate may create a PIN — assert on the storage key, not just the copy, so a
  // renamed heading cannot make this pass while the hole is back.
  it('never offers to create a PIN, and stores none, when no PIN is set (#353)', async () => {
    expect(hasPin()).toBe(false);
    const onExit = vi.fn();
    const { user } = renderGate(onExit);

    await user.click(screen.getByRole('button', { name: 'Exit kid mode' }));

    expect(screen.queryByText(/Set a parent PIN/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Confirm/i)).not.toBeInTheDocument();
    // No PIN pad at all: no digit keys to tap.
    expect(screen.queryByRole('button', { name: '1' })).not.toBeInTheDocument();
    expect(hasPin()).toBe(false);
  });

  // Anti-lockout, and the deliberate limit of the fix. The kid routes refuse to
  // render without a PIN, but clearing it in another tab can strand this one in
  // kid mode. A PIN pad no entry can satisfy would trap the parent, so the gate
  // opens instead — the same answer the route guard gives: no PIN, no kid mode.
  it('lets the parent out rather than trapping them when the PIN vanished mid-session', async () => {
    const onExit = vi.fn();
    const { user } = renderGate(onExit);
    await user.click(screen.getByRole('button', { name: 'Exit kid mode' }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('with PIN already set, verify path accepts the right digits', async () => {
    await setPin('9999');
    const onExit = vi.fn();
    const { user } = renderGate(onExit);

    await user.click(screen.getByRole('button', { name: 'Exit kid mode' }));
    expect(screen.getByText('Enter PIN to exit')).toBeInTheDocument();
    await tapDigits(user, '9999');

    // handleVerify awaits verifyPin() (Web Crypto) before firing onExit (#87).
    await waitFor(() => expect(onExit).toHaveBeenCalledTimes(1));
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

  it('a wrong PIN cannot be escalated into setting a new one', async () => {
    await setPin('9999');
    const onExit = vi.fn();
    const { user } = renderGate(onExit);

    await user.click(screen.getByRole('button', { name: 'Exit kid mode' }));
    await tapDigits(user, '1111');
    await screen.findByText('Wrong PIN');

    // Still the verify pad, and the stored PIN is untouched.
    expect(screen.getByText('Enter PIN to exit')).toBeInTheDocument();
    expect(screen.queryByText(/Set a parent PIN/i)).not.toBeInTheDocument();
    await tapDigits(user, '9999');
    await waitFor(() => expect(onExit).toHaveBeenCalledTimes(1));
  });

  // Throttle (#372): every 5th wrong entry locks the pad with an escalating
  // cooldown. Fake timers (incl. Date) with fireEvent + hand-driven macrotask
  // ticks, following VoiceRecorderDialog.test.tsx: RTL's waitFor does not
  // advance vitest's fake clock, and a real-time countdown interval would
  // set state outside act and trip the console.error guard.
  describe('attempt throttling (#372)', () => {
    const realTick = (): Promise<void> =>
      new Promise((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = () => {
          channel.port1.close();
          resolve();
        };
        channel.port2.postMessage(null);
      });

    beforeEach(() => {
      vi.useFakeTimers({
        toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
      });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    /** One full wrong entry; resolves when the pad has settled (keys re-enabled or locked). */
    const failOnce = async (): Promise<void> => {
      for (const d of '1111') fireEvent.click(screen.getByRole('button', { name: d }));
      await act(async () => {
        for (let i = 0; i < 1000 && !screen.queryByText(/Wrong PIN|Too many tries/); i++)
          await realTick();
      });
    };

    const renderAndLock = async (onExit = vi.fn()): Promise<void> => {
      await setPin('9999');
      render(
        <KidModeGate onExitConfirmed={onExit}>
          {(requestExit) => (
            <button type="button" onClick={requestExit}>
              Exit kid mode
            </button>
          )}
        </KidModeGate>,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Exit kid mode' }));
      // Pre-seed four failures through the module API — the counting is
      // pinned by pinThrottle.test.ts, and five full pad round-trips of
      // hand-driven ticks time out under full-suite load. The fifth entry
      // goes through the pad, so the lock the UI reacts to is the one a
      // real wrong entry engages.
      act(() => {
        for (let i = 0; i < 4; i++) recordPinFailure();
      });
      await failOnce();
    };

    it('locks the keys with a countdown after 5 wrong entries, and reopens after 30s', async () => {
      const onExit = vi.fn();
      await renderAndLock(onExit);

      expect(screen.getByText('Too many tries. Wait 30 seconds.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '1' })).toBeDisabled();

      await act(async () => {
        vi.advanceTimersByTime(30_500);
      });
      expect(screen.getByRole('button', { name: '1' })).toBeEnabled();

      for (const d of '9999') fireEvent.click(screen.getByRole('button', { name: d }));
      await act(async () => {
        for (let i = 0; i < 1000 && onExit.mock.calls.length === 0; i++) await realTick();
      });
      expect(onExit).toHaveBeenCalledTimes(1);
    }, 15_000);

    it('keeps the lock when the pad is closed and reopened', async () => {
      await renderAndLock();

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      fireEvent.click(screen.getByRole('button', { name: 'Exit kid mode' }));

      expect(screen.getByRole('button', { name: '1' })).toBeDisabled();
      expect(screen.getByText('Too many tries. Wait 30 seconds.')).toBeInTheDocument();
    }, 15_000);
  });

  it('cancelling the PIN pad leaves the kid screen mounted', async () => {
    await setPin('9999');
    const onExit = vi.fn();
    const { user } = renderGate(onExit);

    await user.click(screen.getByRole('button', { name: 'Exit kid mode' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByText('Enter PIN to exit')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exit kid mode' })).toBeInTheDocument();
    expect(onExit).not.toHaveBeenCalled();
  });
});
