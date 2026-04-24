import { type JSX, useState } from 'react';

import { KidModeLayout } from '@/features/kid-mode/KidModeLayout';
import { usePictogramsById } from '@/lib/queries/pictograms';
import type { Board, Pictogram } from '@/types/domain';
import { SpeakerIcon } from '@/ui/icons';
import { PictogramMedia } from '@/ui/PictoTile/PictogramMedia';

import styles from './KidSequence.module.css';

interface KidSequenceProps {
  board: Board;
  onExit: () => void;
}

const SPEAK_FLASH_MS = 600;

export const KidSequence = ({ board, onExit }: KidSequenceProps): JSX.Element => {
  const pictogramsById = usePictogramsById();
  const steps: Pictogram[] = board.stepIds
    .map((id) => pictogramsById.get(id))
    .filter((p): p is Pictogram => Boolean(p));
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  const speak = (id: string): void => {
    setSpeakingId(id);
    setTimeout(() => setSpeakingId((curr) => (curr === id ? null : curr)), SPEAK_FLASH_MS);
    // TODO(phase 3): wire to SpeechSynthesis / recorded clip playback.
  };

  return (
    <KidModeLayout eyebrow={board.name.toUpperCase()} title="" onExit={onExit}>
      <div className={styles.strip}>
        {steps.map((p) => {
          const isSpeaking = speakingId === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => speak(p.id)}
              className={[styles.tile, isSpeaking && styles.tileActive]
                .filter(Boolean)
                .join(' ')}
            >
              <div className={styles.mediaWrap}>
                <PictogramMedia picto={p} size={200} className={styles.media} />
                <div
                  className={[styles.speakBadge, isSpeaking && styles.speakBadgeActive]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <SpeakerIcon size={20} />
                </div>
              </div>
              <span className={styles.label}>{p.label}</span>
            </button>
          );
        })}
      </div>
    </KidModeLayout>
  );
};
