import { isGenerateImageError } from '@/lib/queries/generateImage';
import { isGenerateVoiceError } from '@/lib/queries/generateVoice';

const COPY = {
  image: { subject: 'Image', object: 'an image' },
  voice: { subject: 'Voice', object: 'a voice' },
} as const;

/**
 * Only a request that got no response blames the connection: telling a parent
 * to check wifi that is fine sends them chasing the wrong thing. Retry stays
 * the advice either way, because generation is non-deterministic.
 */
export const generationErrorMessage = (kind: keyof typeof COPY, err: unknown): string => {
  const { subject, object } = COPY[kind];
  const code = isGenerateImageError(err) || isGenerateVoiceError(err) ? err.code : null;
  if (code === 'not_configured') return `${subject} generation is not set up on this server.`;
  if (code === 'network')
    return `Could not generate ${object}. Check your connection and try again.`;
  return `${subject} generation failed. Try again in a moment.`;
};
