import { type JSX, useState } from 'react';

import { useSetStepIds } from '@/features/board-builder/mutations';
import {
  type DragBindings,
  Reorderable,
} from '@/features/board-builder/useReorderable';
import { KidModeLayout } from '@/features/kid-mode/KidModeLayout';
import { usePictogramsById } from '@/lib/queries/pictograms';
import { speak } from '@/lib/speech';
import type { Board, Pictogram } from '@/types/domain';
import { SpeakerIcon } from '@/ui/icons';
import { PictogramMedia } from '@/ui/PictoTile/PictogramMedia';

import styles from './KidSequence.module.css';

interface KidSequenceProps {
  board: Board;
  onExit: () => void;
}

const SPEAK_FLASH_MS = 600;

interface Step {
  key: string;
  pictoId: string;
  picto: Pictogram;
  id: string; // alias of key for Reorderable's Identified constraint
}

const buildSteps = (stepIds: readonly string[], byId: Map<string, Pictogram>): Step[] =>
  stepIds.flatMap((pictoId, index) => {
    const picto = byId.get(pictoId);
    if (!picto) return [];
    const key = `${pictoId}-${index}`;
    return [{ key, id: key, pictoId, picto }];
  });

export const KidSequence = ({ board, onExit }: KidSequenceProps): JSX.Element => {
  const pictogramsById = usePictogramsById();
  const steps = buildSteps(board.stepIds, pictogramsById);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const setStepIds = useSetStepIds();

  const announce = (step: Step): void => {
    setSpeakingId(step.picto.id);
    setTimeout(
      () => setSpeakingId((curr) => (curr === step.picto.id ? null : curr)),
      SPEAK_FLASH_MS,
    );
    // 'parent' voice falls back to TTS until recordings ship (Phase 3 step 3).
    if (board.voiceMode !== 'none') speak(step.picto.label);
  };

  const handleReorder = (nextKeys: string[]): void => {
    const byKey = new Map(steps.map((s) => [s.key, s.pictoId]));
    const nextIds = nextKeys
      .map((k) => byKey.get(k))
      .filter((id): id is string => typeof id === 'string');
    setStepIds.mutate({ boardId: board.id, stepIds: nextIds });
  };

  const renderTile = (step: Step, drag?: DragBindings): JSX.Element => {
    const isSpeaking = speakingId === step.picto.id;
    return (
      <button
        ref={drag?.setNodeRef}
        type="button"
        onClick={() => announce(step)}
        className={[styles.tile, isSpeaking && styles.tileActive].filter(Boolean).join(' ')}
        style={drag?.style}
        {...(drag?.attributes ?? {})}
        {...(drag?.listeners ?? {})}
      >
        <div className={styles.mediaWrap}>
          <PictogramMedia picto={step.picto} size={200} className={styles.media} />
          <div
            className={[styles.speakBadge, isSpeaking && styles.speakBadgeActive]
              .filter(Boolean)
              .join(' ')}
          >
            <SpeakerIcon size={20} />
          </div>
        </div>
        <span className={styles.label}>{step.picto.label}</span>
      </button>
    );
  };

  return (
    <KidModeLayout eyebrow={board.name.toUpperCase()} title="" onExit={onExit}>
      <div className={styles.strip}>
        {board.kidReorderable ? (
          <Reorderable
            items={steps}
            onReorder={handleReorder}
            renderItem={(step, _i, drag) => <div key={step.key}>{renderTile(step, drag)}</div>}
          />
        ) : (
          steps.map((step) => <div key={step.key}>{renderTile(step)}</div>)
        )}
      </div>
    </KidModeLayout>
  );
};
