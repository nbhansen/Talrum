import { useMutation, type UseMutationResult } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

/**
 * Client side of the generate-voice edge function (#422). The whole
 * provider (Azure today) lives behind the function; this module only knows
 * the wire contract, mirrored byte-for-byte from
 * `supabase/functions/generate-voice/types.ts` — tsconfig does not include
 * supabase/, so a cross-import is not possible. Change one side, change the
 * other.
 *
 * The returned Blob is a preview. Nothing is stored anywhere until the
 * parent accepts and the caller saves it through useSetPictogramAudio —
 * from that point the clip is indistinguishable from a recording.
 */

const GENERATE_VOICE_FUNCTION_NAME = 'generate-voice';

export const VOICE_LANGUAGES = ['da', 'en'] as const;
export type VoiceLanguage = (typeof VOICE_LANGUAGES)[number];

export const MAX_LABEL_LENGTH = 60;

interface GenerateVoiceInput {
  label: string;
  language: VoiceLanguage;
}

export const useGenerateVoice = (): UseMutationResult<Blob, Error, GenerateVoiceInput> =>
  useMutation({
    mutationFn: async ({ label, language }) => {
      const { data, error } = await supabase.functions.invoke<Blob>(GENERATE_VOICE_FUNCTION_NAME, {
        body: { label, language },
      });
      if (error) throw new Error('voice generation failed');
      // supabase-js parses by content-type: audio/mpeg arrives as a Blob.
      if (!(data instanceof Blob)) throw new Error('voice generation returned no audio');
      return data;
    },
  });
