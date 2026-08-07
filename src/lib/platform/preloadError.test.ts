import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installPreloadErrorRecovery } from './preloadError';
import { captureMessage } from './telemetry';

vi.mock('./telemetry', () => ({ captureMessage: vi.fn() }));

const captureMessageMock = vi.mocked(captureMessage);

const RELOADED_AT = 'talrum-preload-reloaded';
const RELOAD_COUNT = 'talrum-preload-reload-count';

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
    expect(Number(sessionStorage.getItem(RELOADED_AT))).toBeGreaterThan(0);
    expect(sessionStorage.getItem(RELOAD_COUNT)).toBe('1');
    // Deliberately NOT prevented (#443 review round 2): preventing makes
    // the failed import resolve `undefined`, which the route table turns
    // into an opaque TypeError. The original error stays diagnosable.
    expect(event.defaultPrevented).toBe(false);
    expect(captureMessageMock).not.toHaveBeenCalled();
  });

  it('does not reload again when the failure recurs right after the reload', () => {
    // Simulate the page that loads after the recovery reload: fresh stamp.
    sessionStorage.setItem(RELOADED_AT, String(Date.now()));
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
    sessionStorage.setItem(RELOADED_AT, String(Date.now() - 60_000));
    sessionStorage.setItem(RELOAD_COUNT, '1');
    installPreloadErrorRecovery();

    firePreloadError();

    expect(reloadMock).toHaveBeenCalledTimes(1);
    // Same burst (under 10 minutes), so the count carries.
    expect(sessionStorage.getItem(RELOAD_COUNT)).toBe('2');
    expect(captureMessageMock).not.toHaveBeenCalled();
  });

  // window.location.reload() does not stop the current document, so a
  // second failure can arrive before the navigation commits (#443 review
  // round 3). That is the recovery in flight, not a recovery that failed.
  it('stays silent for a second failure while the reload is in flight', () => {
    installPreloadErrorRecovery();

    firePreloadError();
    firePreloadError();

    expect(reloadMock).toHaveBeenCalledTimes(1);
    expect(captureMessageMock).not.toHaveBeenCalled();
  });

  // The timestamp alone only guards a loop whose round trip is under 30s. A
  // stalling chunk request outlasts that window, so the count caps the burst
  // (#443 review round 3).
  it('stops reloading after three reloads when each round trip outlasts the stamp', () => {
    sessionStorage.setItem(RELOADED_AT, String(Date.now() - 60_000));
    sessionStorage.setItem(RELOAD_COUNT, '3');
    installPreloadErrorRecovery();

    firePreloadError();

    expect(reloadMock).not.toHaveBeenCalled();
    expect(captureMessageMock).toHaveBeenCalledWith(
      expect.stringMatching(/after 3 recovery reloads/i),
      expect.objectContaining({ level: 'warning' }),
    );
  });

  // The cap must not disarm the tab for good: the deploy after next is the
  // case this feature exists for.
  it('clears an exhausted count once the burst window has passed', () => {
    sessionStorage.setItem(RELOADED_AT, String(Date.now() - 11 * 60_000));
    sessionStorage.setItem(RELOAD_COUNT, '3');
    installPreloadErrorRecovery();

    firePreloadError();

    expect(reloadMock).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(RELOAD_COUNT)).toBe('1');
    expect(captureMessageMock).not.toHaveBeenCalled();
  });

  // Offline, a reload cannot fetch the missing chunk, and it can replace
  // the app with a browser network error page (#443 review round 4).
  it('does not reload when the tab is offline', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    installPreloadErrorRecovery();

    const event = firePreloadError();

    expect(reloadMock).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(RELOADED_AT)).toBeNull();
    // The route boundary takes it from here and offers a manual reload.
    expect(event.defaultPrevented).toBe(false);
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
    // Its own message (#443 review round 2): "still failing after a
    // recovery reload" would read as the reload fix not working, when no
    // reload ever happened.
    expect(captureMessageMock).toHaveBeenCalledWith(
      expect.stringMatching(/storage blocked/i),
      expect.objectContaining({ level: 'warning' }),
    );
    expect(captureMessageMock).not.toHaveBeenCalledWith(
      expect.stringMatching(/still failing/i),
      expect.anything(),
    );
  });
});
