import type { FunctionsHttpError } from '@supabase/supabase-js';

/** An edge-function failure, carrying one code from the function's closed set. */
export class CodedError<Code extends string> extends Error {
  constructor(
    public readonly code: Code,
    message: string,
  ) {
    super(message);
    this.name = 'CodedError';
  }
}

/** `instanceof CodedError` alone narrows `code` to `string` (#599). */
export const isCodedError = <Code extends string>(
  err: unknown,
  codes: readonly Code[],
): err is CodedError<Code> =>
  err instanceof CodedError && (codes as readonly string[]).includes(err.code);

/**
 * supabase-js routes 4xx/5xx into `error` and keeps the Response on
 * `.context`, so the body must be re-parsed to recover the closed-set code.
 */
export const codeFromHttpError = async <Code extends string>(
  error: FunctionsHttpError,
  knownCodes: readonly Code[],
): Promise<Code | 'internal_error'> => {
  try {
    const body: unknown = await error.context.clone().json();
    const code = (body as { error?: unknown } | null)?.error;
    if (typeof code === 'string' && (knownCodes as readonly string[]).includes(code)) {
      return code as Code;
    }
  } catch {
    // Unparseable body: fall through to the generic code.
  }
  return 'internal_error';
};
