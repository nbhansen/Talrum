import { useEffect, useRef, useState } from 'react';

import { generationErrorMessage } from '@/lib/generationErrorMessage';
import { getAppLanguage } from '@/lib/language';
import { MAX_LABEL_LENGTH, useGenerateVoice } from '@/lib/queries/generateVoice';
import { useBlobPreview } from '@/lib/useBlobPreview';
import type { Pictogram } from '@/types/domain';

type PreviewStatus = 'idle' | 'generating';

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
  save: (blob: Blob) => Promise<boolean>,
  report: (message: string | null) => void,
): GeneratedVoicePreview => {
  const [status, setStatus] = useState<PreviewStatus>('idle');
  const { preview, show, clear } = useBlobPreview<GeneratedPreview>();
  const genMut = useGenerateVoice();

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
      const blob = await genMut.mutateAsync({
        label: picto.label,
        language: getAppLanguage(),
      });
      show({ blob, previewUrl: URL.createObjectURL(blob) });
    } catch (err) {
      report(generationErrorMessage('voice', err));
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

  const savePreview = async (): Promise<void> => {
    if (preview && (await save(preview.blob))) clear();
  };

  return { status, preview, generate, listen, save: savePreview, discard: clear };
};
