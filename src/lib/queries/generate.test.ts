import { FunctionsHttpError } from '@supabase/supabase-js';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TestProviders } from './queries.test-utils';

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
const { isGenerateVoiceError, useGenerateVoice } = await import('./generateVoice');

const captureMock = vi.mocked(captureException);

beforeEach(() => {
  invokeMock.mockReset();
  captureMock.mockReset();
});

describe.each([
  {
    name: 'useGenerateImage',
    useHook: useGenerateImage,
    isOwnError: isGenerateImageError as (err: unknown) => boolean,
    envelopeKey: 'imageBase64',
    mimeType: 'image/jpeg',
    ownCode: 'generation_failed',
    foreignCode: 'synthesis_failed',
    component: 'generateImage',
  },
  {
    name: 'useGenerateVoice',
    useHook: useGenerateVoice,
    isOwnError: isGenerateVoiceError as (err: unknown) => boolean,
    envelopeKey: 'audioBase64',
    mimeType: 'audio/mpeg',
    ownCode: 'synthesis_failed',
    foreignCode: 'generation_failed',
    component: 'generateVoice',
  },
])('$name', ({ useHook, isOwnError, envelopeKey, mimeType, ownCode, foreignCode, component }) => {
  const runMutation = async (): Promise<InstanceType<typeof CodedError<string>>> => {
    const { result } = renderHook(() => useHook(), { wrapper: TestProviders });
    result.current.mutate({ label: 'spise', language: 'da' });
    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    return result.current.error as InstanceType<typeof CodedError<string>>;
  };

  it('decodes the base64 JSON envelope into a Blob with the provider MIME type', async () => {
    invokeMock.mockResolvedValue({
      data: { ok: true, mimeType, [envelopeKey]: btoa('media-bytes') },
      error: null,
    });
    const { result } = renderHook(() => useHook(), { wrapper: TestProviders });
    result.current.mutate({ label: 'spise', language: 'da' });
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    const blob = result.current.data as Blob;
    expect(blob.type).toBe(mimeType);
    expect(await blob.text()).toBe('media-bytes');
  });

  it('rejects a payload that is not the envelope', async () => {
    // What supabase-js would have produced from raw media bytes: a string.
    invokeMock.mockResolvedValue({ data: 'ÿØ…', error: null });
    const error = await runMutation();
    expect(error.code).toBe('internal_error');
  });

  it('maps a server error body to its closed-set code and reports it', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: new FunctionsHttpError(
        new Response(JSON.stringify({ ok: false, error: ownCode, message: 'x' }), {
          status: 502,
        }),
      ),
    });

    const error = await runMutation();

    expect(error).toBeInstanceOf(CodedError);
    expect(error.code).toBe(ownCode);
    // A broken key must not look like flaky wifi to us either.
    expect(captureMock).toHaveBeenCalledWith(expect.any(FunctionsHttpError), {
      level: 'warning',
      tags: { component, op: ownCode },
    });
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

  it('accepts its own codes and network, and nothing else (#599)', () => {
    expect(isOwnError(new CodedError(ownCode, 'x'))).toBe(true);
    expect(isOwnError(new CodedError('network', 'x'))).toBe(true);
    expect(isOwnError(new CodedError(foreignCode, 'x'))).toBe(false);
    expect(isOwnError(new Error('x'))).toBe(false);
  });
});

describe('error guards narrow code to the closed set (#599)', () => {
  it('isGenerateImageError', () => {
    const err: unknown = new CodedError('network', 'x');
    if (!isGenerateImageError(err)) throw err;
    // @ts-expect-error -- a misspelled code must not compile.
    expect(err.code === 'netwrok').toBe(false);
  });

  it('isGenerateVoiceError', () => {
    const err: unknown = new CodedError('network', 'x');
    if (!isGenerateVoiceError(err)) throw err;
    // @ts-expect-error -- a misspelled code must not compile.
    expect(err.code === 'netwrok').toBe(false);
  });
});
