import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { registerServiceWorker } from './serviceWorker';
import { captureMessage } from './telemetry';

vi.mock('./telemetry', () => ({ captureMessage: vi.fn() }));

const captureMessageMock = vi.mocked(captureMessage);

// jsdom reports readyState 'complete', so registerServiceWorker registers
// immediately and these tests need no load event. The deferred path is covered
// separately by stubbing readyState.
const stubServiceWorker = (
  register: () => Promise<unknown>,
  controller: object | null = null,
): EventTarget => {
  const target = new EventTarget();
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: Object.assign(target, { register, controller }),
  });
  return target;
};

const stubReload = (): ReturnType<typeof vi.fn> => {
  const reload = vi.fn();
  Object.defineProperty(window, 'location', { configurable: true, value: { reload } });
  return reload;
};

const removeServiceWorker = (): void => {
  Reflect.deleteProperty(navigator, 'serviceWorker');
};

const stubReadyState = (value: DocumentReadyState): void => {
  Object.defineProperty(document, 'readyState', { configurable: true, value });
};

beforeEach(() => {
  captureMessageMock.mockClear();
  vi.stubEnv('PROD', true);
});

afterEach(() => {
  vi.unstubAllEnvs();
  removeServiceWorker();
  stubReadyState('complete');
});

describe('registerServiceWorker', () => {
  it('reloads once when a new worker replaces the one that served the page', () => {
    const reload = stubReload();
    const target = stubServiceWorker(() => Promise.resolve({}), {});

    registerServiceWorker();
    target.dispatchEvent(new Event('controllerchange'));
    target.dispatchEvent(new Event('controllerchange'));

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload when the first worker takes control of a fresh page', () => {
    const reload = stubReload();
    const target = stubServiceWorker(() => Promise.resolve({}), null);

    registerServiceWorker();
    target.dispatchEvent(new Event('controllerchange'));

    expect(reload).not.toHaveBeenCalled();
  });

  it('registers /sw.js at the root scope', () => {
    const register = vi.fn(() => Promise.resolve({}));
    stubServiceWorker(register);

    registerServiceWorker();

    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
  });

  // The plugin snippet we replaced only ever registered from a `load` listener.
  // A module evaluating after load would have attached a listener for an event
  // that never fires again — no worker, no offline mode, no signal.
  it('registers immediately when the document has already loaded', () => {
    stubReadyState('complete');
    const register = vi.fn(() => Promise.resolve({}));
    stubServiceWorker(register);

    registerServiceWorker();

    expect(register).toHaveBeenCalledTimes(1);
  });

  it('waits for load when the document is still loading', () => {
    stubReadyState('loading');
    const register = vi.fn(() => Promise.resolve({}));
    stubServiceWorker(register);

    registerServiceWorker();
    expect(register).not.toHaveBeenCalled();

    window.dispatchEvent(new Event('load'));
    expect(register).toHaveBeenCalledTimes(1);

    // `once: true` — a second load must not register again.
    window.dispatchEvent(new Event('load'));
    expect(register).toHaveBeenCalledTimes(1);
  });

  // The "handled" half has no explicit assertion: Vitest fails a run on any
  // unhandled rejection, so a passing test is the proof. Reverting the .catch()
  // turns this into an unhandled-error failure, not a silent pass (#375).
  it('reports a rejected registration as a warning instead of letting it go unhandled', async () => {
    stubServiceWorker(() => Promise.reject(new Error('Rejected')));

    registerServiceWorker();
    await vi.waitFor(() => expect(captureMessageMock).toHaveBeenCalledTimes(1));

    expect(captureMessageMock).toHaveBeenCalledWith(
      expect.stringMatching(/offline mode unavailable/i),
      { level: 'warning', extra: { reason: 'Error: Rejected' } },
    );
  });

  it('stringifies a non-Error rejection rather than dropping the reason', async () => {
    stubServiceWorker(() => Promise.reject('blocked by policy'));

    registerServiceWorker();

    await vi.waitFor(() => expect(captureMessageMock).toHaveBeenCalledTimes(1));
    expect(captureMessageMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ extra: { reason: 'blocked by policy' } }),
    );
  });

  it('says nothing when registration succeeds', async () => {
    stubServiceWorker(() => Promise.resolve({}));

    registerServiceWorker();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(captureMessageMock).not.toHaveBeenCalled();
  });

  it('does nothing in a dev build, where no /sw.js is generated', () => {
    vi.stubEnv('PROD', false);
    const register = vi.fn(() => Promise.resolve({}));
    stubServiceWorker(register);

    registerServiceWorker();

    expect(register).not.toHaveBeenCalled();
    expect(captureMessageMock).not.toHaveBeenCalled();
  });

  // Silent by design: no service-worker support is a static browser fact, and
  // reporting it would mostly log crawlers.
  it('stays silent when the browser has no service worker support', () => {
    removeServiceWorker();

    expect(() => registerServiceWorker()).not.toThrow();
    expect(captureMessageMock).not.toHaveBeenCalled();
  });
});
