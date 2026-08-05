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

// A blocked sessionStorage throws SecurityError on every access (privacy
// mode, "block all cookies") — jsdom's always works, so simulate it.
const blockStorage = (): void => {
  const deny = (): never => {
    throw new DOMException('The operation is insecure.', 'SecurityError');
  };
  Object.defineProperty(window, 'sessionStorage', {
    configurable: true,
    value: { getItem: deny, setItem: deny, removeItem: deny },
  });
};

const realSessionStorage = window.sessionStorage;

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
  Object.defineProperty(window, 'sessionStorage', {
    configurable: true,
    value: realSessionStorage,
  });
  vi.restoreAllMocks();
});

describe('installPreloadErrorRecovery', () => {
  it('reloads once on a preload error and stamps the session', () => {
    installPreloadErrorRecovery();

    const event = firePreloadError();

    expect(reloadMock).toHaveBeenCalledTimes(1);
    expect(Number(sessionStorage.getItem(RELOADED_FLAG))).toBeGreaterThan(0);
    // Recovered deliberately: Vite must not also throw the error.
    expect(event.defaultPrevented).toBe(true);
    expect(captureMessageMock).not.toHaveBeenCalled();
  });

  it('does not reload again when the failure recurs right after the reload', () => {
    // Simulate the page that loads after the recovery reload: fresh stamp.
    sessionStorage.setItem(RELOADED_FLAG, String(Date.now()));
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

  // The long-lived tab is the tab this feature exists for: after one
  // recovery it must be armed again for the deploy after next (#443
  // review).
  it('reloads again for a failure long after the previous recovery', () => {
    sessionStorage.setItem(RELOADED_FLAG, String(Date.now() - 60_000));
    installPreloadErrorRecovery();

    firePreloadError();

    expect(reloadMock).toHaveBeenCalledTimes(1);
    expect(captureMessageMock).not.toHaveBeenCalled();
  });

  // Storage blocked (privacy mode): install runs at boot, before render —
  // a throw here would white-screen the app (#443 review).
  it('installs without throwing when sessionStorage is blocked', () => {
    blockStorage();

    expect(() => installPreloadErrorRecovery()).not.toThrow();
  });

  it('never reloads when sessionStorage is blocked — no stamp means no loop guard', () => {
    blockStorage();
    installPreloadErrorRecovery();

    const event = firePreloadError();

    expect(reloadMock).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});
