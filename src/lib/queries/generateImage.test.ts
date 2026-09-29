import { FunctionsHttpError } from '@supabase/supabase-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.fn<(name: string, opts: unknown) => Promise<unknown>>();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: (name: string, opts: unknown) => invokeMock(name, opts) },
  },
}));

vi.mock('@/lib/platform/telemetry', () => ({
  captureException: vi.fn(),
}));

const { captureException } = await import('@/lib/platform/telemetry');
const { CodedError } = await import('./edgeFunction');
const { isGenerateImageError, useGenerateImage } = await import('./generateImage');

const captureMock = vi.mocked(captureException);

const wrapper = ({ children }: { children: ReactNode }): React.ReactElement =>
  createElement(
    QueryClientProvider,
    { client: new QueryClient({ defaultOptions: { mutations: { retry: false } } }) },
    children,
  );

const runMutation = async (): Promise<InstanceType<typeof CodedError<string>>> => {
  const { result } = renderHook(() => useGenerateImage(), { wrapper });
  result.current.mutate({ label: 'spise' });
  await waitFor(() => {
    expect(result.current.isError).toBe(true);
  });
  return result.current.error as InstanceType<typeof CodedError<string>>;
};

beforeEach(() => {
  invokeMock.mockReset();
  captureMock.mockReset();
});

describe('useGenerateImage envelope decoding', () => {
  it('decodes the base64 JSON envelope into a Blob with the provider MIME type', async () => {
    invokeMock.mockResolvedValue({
      data: { ok: true, mimeType: 'image/jpeg', imageBase64: btoa('image-bytes') },
      error: null,
    });
    const { result } = renderHook(() => useGenerateImage(), { wrapper });
    result.current.mutate({ label: 'spise' });
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    const blob = result.current.data as Blob;
    expect(blob.type).toBe('image/jpeg');
    expect(await blob.text()).toBe('image-bytes');
  });

  it('rejects a payload that is not the envelope', async () => {
    // What supabase-js would have produced from raw image bytes: a string.
    invokeMock.mockResolvedValue({ data: 'ÿØ…', error: null });
    const error = await runMutation();
    expect(error.code).toBe('internal_error');
  });
});

describe('useGenerateImage error mapping', () => {
  it('maps a server error body to its closed-set code and reports it', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: new FunctionsHttpError(
        new Response(JSON.stringify({ ok: false, error: 'generation_failed', message: 'x' }), {
          status: 502,
        }),
      ),
    });

    const error = await runMutation();

    expect(error).toBeInstanceOf(CodedError);
    expect(error.code).toBe('generation_failed');
    // A broken key must not look like flaky wifi to us either.
    expect(captureMock).toHaveBeenCalledWith(expect.any(FunctionsHttpError), {
      level: 'warning',
      tags: { component: 'generateImage', op: 'generation_failed' },
    });
  });

  it('maps an unknown or unparseable body to internal_error', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: new FunctionsHttpError(new Response('not json', { status: 500 })),
    });

    const error = await runMutation();

    expect(error.code).toBe('internal_error');
  });

  it('maps a request that never got a response to network, without reporting', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: new Error('fetch failed'),
    });

    const error = await runMutation();

    expect(error.code).toBe('network');
    expect(captureMock).not.toHaveBeenCalled();
  });
});

describe('isGenerateImageError (#599)', () => {
  it('accepts its own codes and network, and nothing else', () => {
    expect(isGenerateImageError(new CodedError('generation_failed', 'x'))).toBe(true);
    expect(isGenerateImageError(new CodedError('network', 'x'))).toBe(true);
    expect(isGenerateImageError(new CodedError('synthesis_failed', 'x'))).toBe(false);
    expect(isGenerateImageError(new Error('x'))).toBe(false);
  });

  it('narrows code to the closed set', () => {
    const err: unknown = new CodedError('network', 'x');
    if (!isGenerateImageError(err)) throw err;
    // @ts-expect-error -- a misspelled code must not compile.
    expect(err.code === 'netwrok').toBe(false);
  });
});
