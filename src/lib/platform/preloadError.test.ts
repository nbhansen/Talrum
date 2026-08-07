import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installPreloadErrorRecovery } from './preloadError';
import { captureMessage } from './telemetry';

vi.mock('./telemetry', () => ({ captureMessage: vi.fn() }));

const captureMessageMock = vi.mocked(captureMessage);

const RELOADED_AT = 'talrum-preload-reloaded';
const RELOAD_COUNT = 'talrum-preload-reload-count';

const reloadMock = vi.fn();

const FAILED_ASSET = 'Unable to preload CSS for /assets/BoardBuilderRoute-BdTI5M7_.css';

// Vite puts the underlying Error on the event's `payload`.
const firePreloadError = (): Event => {
  const event = Object.assign(new Event('vite:preloadError', { cancelable: true }), {
    payload: new Error(FAILED_ASSET),
  });
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
    // Preventing makes the failed import resolve `undefined`, which the route
    // table turns into an opaque TypeError (#442).
    expect(event.defaultPrevented).toBe(false);
    expect(captureMessageMock).not.toHaveBeenCalled();
  });

  it('does not reload again when the failure recurs right after the reload', () => {
    // The page that loads after the recovery reload, with a fresh stamp.
    sessionStorage.setItem(RELOADED_AT, String(Date.now()));
    installPreloadErrorRecovery();

    const event = firePreloadError();

    expect(reloadMock).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    expect(captureMessageMock).toHaveBeenCalledWith(
      expect.stringMatching(/still failing/i),
      expect.objectContaining({ level: 'warning' }),
    );
  });

  // A long-lived tab is what this feature exists for, so one recovery must not
  // disarm it for the deploy after next.
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

  // `reload()` does not stop the current document, so a second failure before
  // the navigation commits is the recovery in flight, not a failed one.
  it('stays silent for a second failure while the reload is in flight', () => {
    installPreloadErrorRecovery();

    firePreloadError();
    firePreloadError();

    expect(reloadMock).toHaveBeenCalledTimes(1);
    expect(captureMessageMock).not.toHaveBeenCalled();
  });

  // The timestamp alone guards only a loop whose round trip is under 30 s, and
  // a stalling chunk request outlasts that.
  it('stops reloading after three reloads when each round trip outlasts the stamp', () => {
    sessionStorage.setItem(RELOADED_AT, String(Date.now() - 60_000));
    sessionStorage.setItem(RELOAD_COUNT, '3');
    installPreloadErrorRecovery();

    firePreloadError();

    expect(reloadMock).not.toHaveBeenCalled();
    expect(captureMessageMock).toHaveBeenCalledWith(
      expect.stringMatching(/reload cap reached/i),
      expect.objectContaining({ level: 'warning' }),
    );
  });

  // The cap must not disarm the tab for good.
  it('clears an exhausted count once the burst window has passed', () => {
    sessionStorage.setItem(RELOADED_AT, String(Date.now() - 11 * 60_000));
    sessionStorage.setItem(RELOAD_COUNT, '3');
    installPreloadErrorRecovery();

    firePreloadError();

    expect(reloadMock).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(RELOAD_COUNT)).toBe('1');
    expect(captureMessageMock).not.toHaveBeenCalled();
  });

  // Offline a reload cannot fetch the chunk, and may replace the running app
  // with a browser error page.
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

  // Install runs at boot, before render, so a throw here white-screens the app.
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
    // Its own message: "still failing after a recovery reload" would read as
    // the fix not working, when no reload ever happened.
    expect(captureMessageMock).toHaveBeenCalledWith(
      expect.stringMatching(/storage blocked/i),
      expect.objectContaining({ level: 'warning' }),
    );
    expect(captureMessageMock).not.toHaveBeenCalledWith(
      expect.stringMatching(/still failing/i),
      expect.anything(),
    );
  });

  // A constant message says nothing about which asset broke — the detail #442
  // was diagnosed from.
  it('reports which asset failed', () => {
    sessionStorage.setItem(RELOADED_AT, String(Date.now()));
    installPreloadErrorRecovery();

    firePreloadError();

    expect(captureMessageMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ extra: { reason: `Error: ${FAILED_ASSET}` } }),
    );
  });

  // getItem works, setItem throws (quota, or Safari's partial restrictions).
  // Without a report this path is silent: no reload and no telemetry.
  it('reports when the reload guard cannot be written', () => {
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: {
        getItem: () => null,
        setItem: () => {
          throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
        },
        removeItem: () => undefined,
      },
    });
    installPreloadErrorRecovery();

    firePreloadError();

    expect(reloadMock).not.toHaveBeenCalled();
    expect(captureMessageMock).toHaveBeenCalledWith(
      expect.stringMatching(/could not persist the reload guard/i),
      expect.objectContaining({ level: 'warning' }),
    );
  });

  // The two writes are not atomic, and a stamp with no count would claim a
  // reload that never happened.
  it('leaves no stamp when only part of the reload guard can be written', () => {
    const store = new Map<string, string>();
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          if (key === RELOADED_AT) throw new DOMException('Quota', 'QuotaExceededError');
          store.set(key, value);
        },
        removeItem: (key: string) => store.delete(key),
      },
    });
    installPreloadErrorRecovery();

    firePreloadError();

    expect(reloadMock).not.toHaveBeenCalled();
    expect(store.has(RELOADED_AT)).toBe(false);
    expect(captureMessageMock).toHaveBeenCalledWith(
      expect.stringMatching(/could not persist the reload guard/i),
      expect.objectContaining({ level: 'warning' }),
    );

    // A count with no stamp must not read back as a recovery: the next
    // failure is armed, not "still failing".
    captureMessageMock.mockClear();
    firePreloadError();

    expect(captureMessageMock).not.toHaveBeenCalledWith(
      expect.stringMatching(/still failing/i),
      expect.anything(),
    );
  });
});
