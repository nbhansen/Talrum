import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installPreloadErrorRecovery } from './preloadError';
import { captureMessage } from './telemetry';

vi.mock('./telemetry', () => ({ captureMessage: vi.fn() }));

const captureMessageMock = vi.mocked(captureMessage);

const RELOADED_FLAG = 'talrum-preload-reloaded';

const reloadMock = vi.fn();

const firePreloadError = (): Event => {
  const event = new Event('vite:preloadError', { cancelable: true });
  window.dispatchEvent(event);
  return event;
};

beforeEach(() => {
  captureMessageMock.mockClear();
  reloadMock.mockClear();
  sessionStorage.clear();
  // jsdom's location.reload throws "Not implemented"; replace the location
  // object so the recovery path is observable.
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, reload: reloadMock },
  });
});

// No listener teardown needed: install replaces any previous listener, so
// the last install in each test is the only one that fires.
afterEach(() => {
  vi.restoreAllMocks();
});

describe('installPreloadErrorRecovery', () => {
  it('reloads once on a preload error and marks the session', () => {
    installPreloadErrorRecovery();

    const event = firePreloadError();

    expect(reloadMock).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(RELOADED_FLAG)).not.toBeNull();
    // Recovered deliberately: Vite must not also throw the error.
    expect(event.defaultPrevented).toBe(true);
    expect(captureMessageMock).not.toHaveBeenCalled();
  });

  it('does not reload again when the page after the reload fails the same way', () => {
    // Simulate the page that loads after the recovery reload.
    sessionStorage.setItem(RELOADED_FLAG, 'true');
    installPreloadErrorRecovery();

    const event = firePreloadError();

    expect(reloadMock).not.toHaveBeenCalled();
    // Not prevented: the error propagates to the route boundary.
    expect(event.defaultPrevented).toBe(false);
    expect(captureMessageMock).toHaveBeenCalledWith(
      expect.stringMatching(/still failing/i),
      expect.objectContaining({ level: 'warning' }),
    );
  });

  it('re-arms after a page that loads cleanly following the recovery reload', () => {
    // The recovered page removes the flag at install time...
    sessionStorage.setItem(RELOADED_FLAG, 'true');
    installPreloadErrorRecovery();
    expect(sessionStorage.getItem(RELOADED_FLAG)).toBeNull();
  });
});
