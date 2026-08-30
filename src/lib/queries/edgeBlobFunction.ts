import { FunctionsHttpError } from '@supabase/supabase-js';

import { captureException } from '@/lib/platform/telemetry';
import { supabase } from '@/lib/supabase';

/**
 * Shared client for edge functions that answer with a base64 media envelope
 * (generate-image, generate-voice): invoke, closed-set error mapping, and
 * envelope decode. Each caller keeps its own wire-contract literals.
 */
interface InvokeBlobOptions<Code extends string> {
  functionName: string;
  /** Tag value for telemetry; kept separate from functionName for stability. */
  telemetryComponent: string;
  body: Record<string, unknown>;
  knownCodes: ReadonlySet<Code>;
  /** JSON field carrying the base64 payload ('imageBase64' / 'audioBase64'). */
  envelopeKey: string;
  makeError: (code: Code | 'network' | 'internal_error', message: string) => Error;
  emptyMessage: string;
  invalidMessage: string;
}

interface Envelope {
  mimeType: string;
  base64: string;
}

const asEnvelope = (v: unknown, envelopeKey: string): Envelope | null => {
  if (v === null || typeof v !== 'object') return null;
  const rec = v as Record<string, unknown>;
  if (rec.ok !== true || typeof rec.mimeType !== 'string') return null;
  const base64 = rec[envelopeKey];
  return typeof base64 === 'string' ? { mimeType: rec.mimeType, base64 } : null;
};

export const invokeBlobFunction = async <Code extends string>(
  opts: InvokeBlobOptions<Code>,
): Promise<Blob> => {
  const isKnown = (s: string): s is Code => (opts.knownCodes as ReadonlySet<string>).has(s);

  const codeFromHttpError = async (error: FunctionsHttpError): Promise<Code | 'internal_error'> => {
    try {
      const body: unknown = await error.context.clone().json();
      if (
        body !== null &&
        typeof body === 'object' &&
        'error' in body &&
        typeof (body as { error: unknown }).error === 'string' &&
        isKnown((body as { error: string }).error)
      ) {
        return (body as { error: string }).error as Code;
      }
    } catch {
      // Unparseable body: fall through to the generic code.
    }
    return 'internal_error';
  };

  const { data, error } = await supabase.functions.invoke<unknown>(opts.functionName, {
    body: opts.body,
  });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      // The server answered, so this is not the network's fault — a broken
      // Azure key must not look like flaky wifi, to the parent or to us
      // (#359 rationale).
      const code = await codeFromHttpError(error);
      captureException(error, {
        level: 'warning',
        tags: { component: opts.telemetryComponent, op: code },
      });
      throw opts.makeError(code, error.message);
    }
    throw opts.makeError('network', error.message);
  }
  const envelope = asEnvelope(data, opts.envelopeKey);
  if (!envelope) throw opts.makeError('internal_error', opts.emptyMessage);
  try {
    const bytes = Uint8Array.from(atob(envelope.base64), (c) => c.charCodeAt(0));
    return new Blob([bytes], { type: envelope.mimeType });
  } catch {
    throw opts.makeError('internal_error', opts.invalidMessage);
  }
};
