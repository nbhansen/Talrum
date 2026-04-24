import { AUDIO_BUCKET, signedUrlFor } from './storage';

let current: HTMLAudioElement | null = null;

export const playPictogramAudio = async (path: string): Promise<void> => {
  const url = await signedUrlFor(AUDIO_BUCKET, path);
  if (current) {
    current.pause();
    current.src = '';
  }
  const audio = new Audio(url);
  current = audio;
  await audio.play();
};
