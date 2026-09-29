import { describe, expect, it } from 'vitest';

import { DELETE_ACCOUNT_ERROR_CODES, DELETE_ACCOUNT_FUNCTION_NAME } from './account';
import { GENERATE_IMAGE_ERROR_CODES, GENERATE_IMAGE_FUNCTION_NAME } from './generateImage';
import {
  GENERATE_VOICE_ERROR_CODES,
  GENERATE_VOICE_FUNCTION_NAME,
  MAX_LABEL_LENGTH,
} from './generateVoice';

// tsconfig excludes supabase/, so the client mirrors each function's wire
// contract by hand. Reading the server source pins the two copies together.
const sources = import.meta.glob<string>('../../../supabase/functions/*/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const functionSource = (dir: string, file = 'types.ts'): string => {
  const source = sources[`../../../supabase/functions/${dir}/${file}`];
  if (source === undefined) throw new Error(`no supabase/functions/${dir}/${file}`);
  return source;
};

const serverErrorCodes = (dir: string): string[] => {
  const union = /export type ErrorCode =([^;]+);/.exec(functionSource(dir))?.[1] ?? '';
  return [...union.matchAll(/'([a-z_]+)'/g)].map((m) => m[1] ?? '').sort();
};

describe('edge-function wire contract', () => {
  it.each([
    [DELETE_ACCOUNT_FUNCTION_NAME, DELETE_ACCOUNT_ERROR_CODES],
    [GENERATE_IMAGE_FUNCTION_NAME, GENERATE_IMAGE_ERROR_CODES],
    [GENERATE_VOICE_FUNCTION_NAME, GENERATE_VOICE_ERROR_CODES],
  ])('%s: the client knows every error code the function sends', (dir, clientCodes) => {
    const server = serverErrorCodes(dir);
    expect(server.length).toBeGreaterThan(0);
    expect([...clientCodes].sort()).toEqual(server);
  });

  it('generate-voice: the client label cap is the server cap', () => {
    expect(functionSource('_shared', 'generateHandler.ts')).toContain(
      `export const MAX_LABEL_LENGTH = ${MAX_LABEL_LENGTH};`,
    );
  });
});
