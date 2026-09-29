import { useEffect, useRef, useState } from 'react';

import { getVoiceLanguage, isAppLanguage } from '@/lib/language';
import { extensionForMime } from '@/lib/platform/recording';
import {
  isGenerateVoiceError,
  MAX_LABEL_LENGTH,
  useGenerateVoice,
} from '@/lib/queries/generateVoice';
import { useSetPictogramAudio } from '@/lib/queries/pictograms';
import { useBlobPreview } from '@/lib/useBlobPreview';
import type { Pictogram } from '@/types/domain';

type PreviewStatus = 'idle' | 'generating' | 'uploading';

/** A generated clip held for preview. Nothing is saved until the parent accepts. */
interface GeneratedPreview {
  blob: Blob;
  previewUrl: string;
}

interface GeneratedVoicePreview {
  status: PreviewStatus;
  preview: GeneratedPreview | null;
  generate: () => Promise<void>;
  listen: () => void;
  save: () => Promise<void>;
  discard: () => void;
}

export const useGeneratedVoicePreview = (
  picto: Pictogram,
  report: (message: string | null) => void,
): GeneratedVoicePreview => {
  const [status, setStatus] = useState<PreviewStatus>('idle');
  const { preview, show, clear } = useBlobPreview<GeneratedPreview>();
  const genMut = useGenerateVoice();
  const saveMut = useSetPictogramAudio();

  // The playing element for the current preview, so Listen taps replace the
  // clip instead of layering voices. Playback must not outlive the preview.
  const audioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, [preview]);

  const generate = async (): Promise<void> => {
    report(null);
    // The one generation failure predictable without a round trip.
    if (picto.label.length > MAX_LABEL_LENGTH) {
      report('This label is too long for voice generation.');
      return;
    }
    setStatus('generating');
    try {
      // getVoiceLanguage, not getAppLanguage: the voice should match what
      // the TTS fallback would speak, not the language of parent-UI copy.
      // Clamped to the function's closed set — for a locale we have no
      // neural voice for, English is the least-wrong default.
      const voiceLang = getVoiceLanguage();
      const blob = await genMut.mutateAsync({
        label: picto.label,
        language: isAppLanguage(voiceLang) ? voiceLang : 'en',
      });
      show({ blob, previewUrl: URL.createObjectURL(blob) });
    } catch (err) {
      // Only a request that never got a response blames the connection;
      // a server-side failure told to "check your connection" sends the
      // parent chasing wifi that is fine.
      report(
        isGenerateVoiceError(err) && err.code !== 'network'
          ? 'Voice generation failed. Try again in a moment.'
          : 'Could not generate a voice. Check your connection and try again.',
      );
    } finally {
      setStatus('idle');
    }
  };

  const listen = (): void => {
    if (!preview) return;
    report(null);
    audioRef.current?.pause();
    const audio = new Audio(preview.previewUrl);
    audioRef.current = audio;
    audio.play().catch(() => {
      report('Could not play the preview.');
    });
  };

  const save = async (): Promise<void> => {
    if (!preview) return;
    setStatus('uploading');
    try {
      await saveMut.mutateAsync({
        pictogramId: picto.id,
        blob: preview.blob,
        // From the blob's MIME type, not a literal: the provider MIME type
        // is the one piece of provider knowledge the seam propagates.
        extension: extensionForMime(preview.blob.type),
      });
      clear();
      setStatus('idle');
    } catch {
      setStatus('idle');
      report('Upload failed. Check your connection and try again.');
    }
  };

  return { status, preview, generate, listen, save, discard: clear };
};
