import type {
  GeneratedMedia,
  GenerateErrorCode,
  GenerateLanguage,
} from '../_shared/generateHandler.ts';

/**
 * Wire contract for the generate-voice edge function. The client mirrors
 * these codes in `src/lib/queries/generateVoice.ts`, and wireContract.test.ts
 * pins the two copies together.
 */

export type ErrorCode = GenerateErrorCode | 'synthesis_failed';

/**
 * The provider seam. To swap providers, implement this signature in a new file
 * and change one import in index.ts. Nothing else — not the HTTP shell, not
 * the client — may know which provider runs.
 */
export type Synthesize = (label: string, language: GenerateLanguage) => Promise<GeneratedMedia>;
