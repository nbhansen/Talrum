import type { Breadcrumb } from '@sentry/react';
import * as Sentry from '@sentry/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { initTelemetry } from './telemetry';

vi.mock('@sentry/react', () => ({
  init: vi.fn(),
  getClient: vi.fn(() => undefined),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

const initAndGetHook = (): ((b: Breadcrumb) => Breadcrumb | null) => {
  vi.stubEnv('PROD', true);
  vi.stubEnv('VITE_SENTRY_DSN', 'https://key@sentry.test/1');
  initTelemetry();
  const config = vi.mocked(Sentry.init).mock.calls[0]?.[0];
  const hook = config?.beforeBreadcrumb;
  if (!hook) throw new Error('beforeBreadcrumb missing from Sentry.init config');
  return (b) => hook(b, undefined);
};

describe('beforeBreadcrumb', () => {
  // Load-bearing, not cosmetic: the default fetch breadcrumb carries the full
  // URL in data.url, and audio fetches use signed storage URLs whose ?token=
  // is a one-hour bearer token for a child's voice recording.
  it('strips the query string from breadcrumb URLs', () => {
    const hook = initAndGetHook();
    const result = hook({
      category: 'fetch',
      data: {
        method: 'GET',
        url: 'https://p.supabase.co/storage/v1/object/sign/pictogram-audio/u/a.webm?token=jwt',
        status_code: 403,
      },
    });
    expect(result?.data).toEqual({
      method: 'GET',
      url: 'https://p.supabase.co/storage/v1/object/sign/pictogram-audio/u/a.webm',
      status_code: 403,
    });
  });

  it('passes breadcrumbs without a query string through unchanged', () => {
    const hook = initAndGetHook();
    const plain: Breadcrumb = { category: 'console', message: 'hello' };
    expect(hook(plain)).toBe(plain);
    const noQuery: Breadcrumb = { category: 'fetch', data: { url: 'https://a.test/x' } };
    expect(hook(noQuery)).toBe(noQuery);
  });
});
