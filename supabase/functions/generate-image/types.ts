import type { GenerateErrorCode } from '../_shared/generateHandler.ts';

/**
 * Wire contract for the generate-image edge function. The client mirrors
 * these codes in `src/lib/queries/generateImage.ts`, and wireContract.test.ts
 * pins the two copies together.
 */

export { MAX_LABEL_LENGTH } from '../_shared/generateHandler.ts';

export type ErrorCode = GenerateErrorCode | 'generation_failed';

/**
 * The provider seam. The prompt arrives fully built, because the style template
 * is app policy and not provider knowledge. To swap providers, implement this
 * signature in a new file and change one import in index.ts.
 */
export type GenerateImage = (
  prompt: string,
) => Promise<{ bytes: Uint8Array<ArrayBuffer>; mimeType: string }>;
