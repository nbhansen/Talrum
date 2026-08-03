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
const { GenerateVoiceError, useGenerateVoice } = await import('./generateVoice');

const captureMock = vi.mocked(captureException);

const wrapper = ({ children }: { children: ReactNode }): React.ReactElement =>
  createElement(
    QueryClientProvider,
    { client: new QueryClient({ defaultOptions: { mutations: { retry: false } } }) },
    children,
  );

const runMutation = async (): Promise<InstanceType<typeof GenerateVoiceError>> => {
  const { result } = renderHook(() => useGenerateVoice(), { wrapper });
  result.current.mutate({ label: 'spise', language: 'da' });
  await waitFor(() => {
    expect(result.current.isError).toBe(true);
  });
  return result.current.error as InstanceType<typeof GenerateVoiceError>;
};

beforeEach(() => {
  invokeMock.mockReset();
  captureMock.mockReset();
});

describe('useGenerateVoice envelope decoding', () => {
  it('decodes the base64 JSON envelope into a Blob with the provider MIME type', async () => {
    invokeMock.mockResolvedValue({
      data: { ok: true, mimeType: 'audio/mpeg', audioBase64: btoa('clip-bytes') },
      error: null,
    });
    const { result } = renderHook(() => useGenerateVoice(), { wrapper });
    result.current.mutate({ label: 'spise', language: 'da' });
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    const blob = result.current.data as Blob;
    expect(blob.type).toBe('audio/mpeg');
    expect(await blob.text()).toBe('clip-bytes');
  });

  it('rejects a payload that is not the envelope', async () => {
    // What supabase-js would have produced from raw audio bytes: a string.
    invokeMock.mockResolvedValue({ data: 'ID3…', error: null });
    const error = await runMutation();
    expect(error.code).toBe('internal_error');
  });
});

describe('useGenerateVoice error mapping (#433 review)', () => {
  it('maps a server error body to its closed-set code and reports it', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: new FunctionsHttpError(
        new Response(JSON.stringify({ ok: false, error: 'synthesis_failed', message: 'x' }), {
          status: 502,
        }),
      ),
    });

    const error = await runMutation();

    expect(error).toBeInstanceOf(GenerateVoiceError);
    expect(error.code).toBe('synthesis_failed');
    // A broken key must not look like flaky wifi to us either.
    expect(captureMock).toHaveBeenCalledWith(expect.any(FunctionsHttpError), {
      level: 'warning',
      tags: { component: 'generateVoice', op: 'synthesis_failed' },
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
