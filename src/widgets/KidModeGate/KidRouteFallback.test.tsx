import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearPin, setPin } from '@/lib/pin';

import { KidRouteFallback } from './KidRouteFallback';

const reload = vi.fn();

beforeEach(() => {
  clearPin();
  reload.mockClear();
  // jsdom's location.reload only warns; replace it so the call is observable.
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, reload },
  });
});

afterEach(() => {
  clearPin();
  vi.restoreAllMocks();
});

const renderFallback = (): { user: ReturnType<typeof userEvent.setup> } => {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/kid/sequence/b1']}>
      <Routes>
        <Route path="/kid/sequence/:boardId" element={<KidRouteFallback />} />
        <Route path="/" element={<div data-testid="parent-home" />} />
      </Routes>
    </MemoryRouter>,
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

describe('KidRouteFallback (#371)', () => {
  // The absence of any link, not the old label: renaming the button must not
  // make this pass with the one-tap route into parent UI reopened.
  it('offers no way into parent UI that a tap alone can reach', async () => {
    await setPin('9999');
    renderFallback();

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByTestId('parent-home')).not.toBeInTheDocument();
  });

  it('reloads the current kid route rather than navigating away', async () => {
    await setPin('9999');
    const { user } = renderFallback();

    await user.click(screen.getByRole('button', { name: 'Tap to try again' }));

    expect(reload).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('parent-home')).not.toBeInTheDocument();
  });

  it('asks for the PIN before letting anyone out to parent home', async () => {
    await setPin('9999');
    const { user } = renderFallback();

    await user.click(screen.getByRole('button', { name: 'Exit kid mode' }));

    expect(screen.getByText('Enter PIN to exit')).toBeInTheDocument();
    expect(screen.queryByTestId('parent-home')).not.toBeInTheDocument();
  });

  it('stays put on a wrong PIN', async () => {
    await setPin('9999');
    const { user } = renderFallback();

    await user.click(screen.getByRole('button', { name: 'Exit kid mode' }));
    await tapDigits(user, '1111');

    expect(await screen.findByText('Wrong PIN')).toBeInTheDocument();
    expect(screen.queryByTestId('parent-home')).not.toBeInTheDocument();
  });

  it('leaves for parent home on the right PIN', async () => {
    await setPin('9999');
    const { user } = renderFallback();

    await user.click(screen.getByRole('button', { name: 'Exit kid mode' }));
    await tapDigits(user, '9999');

    await waitFor(() => expect(screen.getByTestId('parent-home')).toBeInTheDocument());
  });

  it('cancelling the pad returns to the crash screen, still contained', async () => {
    await setPin('9999');
    const { user } = renderFallback();

    await user.click(screen.getByRole('button', { name: 'Exit kid mode' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('button', { name: 'Tap to try again' })).toBeInTheDocument();
    expect(screen.queryByTestId('parent-home')).not.toBeInTheDocument();
  });

  // Same rule as KidModeGate: with no PIN to verify against, a pad would strand
  // the parent on a broken screen.
  it('lets the parent out without a pad when no PIN is stored', async () => {
    const { user } = renderFallback();

    await user.click(screen.getByRole('button', { name: 'Exit kid mode' }));

    expect(screen.queryByRole('button', { name: '1' })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('parent-home')).toBeInTheDocument());
  });

  it('skips the pad when the gate is disabled by build flag', async () => {
    vi.stubEnv('VITE_DISABLE_PIN', '1');
    try {
      await setPin('9999');
      const { user } = renderFallback();

      await user.click(screen.getByRole('button', { name: 'Exit kid mode' }));

      await waitFor(() => expect(screen.getByTestId('parent-home')).toBeInTheDocument());
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
