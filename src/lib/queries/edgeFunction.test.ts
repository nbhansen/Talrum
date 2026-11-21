import { FunctionsHttpError } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { codeFromHttpError } from './edgeFunction';

const CODES = ['unauthorized', 'auth_delete_failed'] as const;

const httpError = (body: string): FunctionsHttpError =>
  new FunctionsHttpError(new Response(body, { status: 500 }));

// supabase-js routes 4xx/5xx into `error`, so the code arrives inside the
// FunctionsHttpError body, never as a 2xx { ok: false } payload.
describe('codeFromHttpError', () => {
  it('returns a code from the closed set', async () => {
    const error = httpError(JSON.stringify({ ok: false, error: 'auth_delete_failed' }));
    expect(await codeFromHttpError(error, CODES)).toBe('auth_delete_failed');
  });

  it.each([
    ['a code outside the closed set', JSON.stringify({ ok: false, error: 'who_knows' })],
    ['a body with no error field', JSON.stringify({ not_an_error_field: 'x' })],
    ['a body that is not JSON', 'not json at all'],
  ])('falls back to internal_error for %s', async (_case, body) => {
    expect(await codeFromHttpError(httpError(body), CODES)).toBe('internal_error');
  });
});
