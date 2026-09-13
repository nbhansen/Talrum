import { type JSX, type PointerEvent, useEffect, useRef, useState } from 'react';

import { KidModeLayout } from '@/layouts/KidModeLayout';
import { type BoardStep, buildBoardSteps, reorderBoardSteps } from '@/lib/boardSteps';
import { getKidCopy } from '@/lib/kidCopy';
import { useSetStepIds } from '@/lib/queries/boards';
import { usePictogramsById } from '@/lib/queries/pictograms';
import { useLongPress } from '@/lib/useLongPress';
import { speakPictogram } from '@/lib/voiceOut';
import type { Board } from '@/types/domain';
import { EmptyState } from '@/ui/EmptyState/EmptyState';
import { CheckIcon, SpeakerIcon } from '@/ui/icons';
import { type DragBindings, Reorderable } from '@/ui/Reorderable/Reorderable';
import { PictogramMedia } from '@/widgets/PictoTile/PictogramMedia';

import styles from './KidSequence.module.css';

interface KidSequenceProps {
  board: Board;
  onExit: () => void;
}

const SPEAK_FLASH_MS = 600;
// Tile content widths: 140px and 320px minus 16px padding each side and the
// 2px borders (border-box).
const MEDIA_SIZE = 104;
const CURRENT_MEDIA_SIZE = 284;

interface SequenceTileProps {
  step: BoardStep;
  labelsVisible: boolean;
  isSpeaking: boolean;
  isDone: boolean;
  isCurrent: boolean;
  onTap: () => void;
  onToggleDone: () => void;
  drag?: DragBindings | undefined;
}

const SequenceTile = ({
  step,
  labelsVisible,
  isSpeaking,
  isDone,
  isCurrent,
  onTap,
  onToggleDone,
  drag,
}: SequenceTileProps): JSX.Element => {
  const press = useLongPress({
    onLongPress: onToggleDone,
    onTap,
    disabled: drag?.isDragging ?? false,
  });
  // dnd-kit's listener is only onPointerDown; merge it with the hold start.
  const onPointerDown = (e: PointerEvent<HTMLButtonElement>): void => {
    press.onPointerDown(e);
    drag?.listeners?.onPointerDown?.(e);
  };
  return (
    <button
      ref={drag?.setNodeRef}
      type="button"
      className={[
        styles.tile,
        isSpeaking && styles.tileActive,
        isDone && styles.tileDone,
        isCurrent && styles.tileCurrent,
      ]
        .filter(Boolean)
        .join(' ')}
      style={drag?.style}
      {...(drag?.attributes ?? {})}
      {...press}
      onPointerDown={onPointerDown}
      aria-label={labelsVisible ? undefined : step.picto.label}
      aria-pressed={isDone}
    >
      <div className={styles.mediaWrap}>
        <PictogramMedia
          picto={step.picto}
          size={isCurrent ? CURRENT_MEDIA_SIZE : MEDIA_SIZE}
          className={styles.media}
        />
        <div
          className={[styles.speakBadge, isSpeaking && styles.speakBadgeActive]
            .filter(Boolean)
            .join(' ')}
        >
          <SpeakerIcon size={20} />
        </div>
        {isDone && (
          <div className={styles.doneBadge}>
            <CheckIcon size={20} />
          </div>
        )}
      </div>
      {labelsVisible && <span className={styles.label}>{step.picto.label}</span>}
    </button>
  );
};

export const KidSequence = ({ board, onExit }: KidSequenceProps): JSX.Element => {
  const kidCopy = getKidCopy();
  const pictogramsById = usePictogramsById();
  const steps = buildBoardSteps(board.stepIds, pictogramsById);
  // Track the speaking flash and done state by slot key, not pictogram id: a
  // sequence may repeat the same pictogram ("jump, jump, jump"), and an
  // id-keyed flash would light up every identical tile at once (#273).
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);
  const [doneKeys, setDoneKeys] = useState<ReadonlySet<string>>(() => new Set());
  const setStepIds = useSetStepIds();

  // Tracked so unmount cancels it, or a stray setState runs on a torn-down
  // tree. It also lets a rapid second tap reset the timer instead of stacking,
  // so A→B does not cut B's flash short.
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );

  const announce = (step: BoardStep): void => {
    setSpeakingKey(step.key);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => {
      flashTimer.current = null;
      setSpeakingKey((curr) => (curr === step.key ? null : curr));
    }, SPEAK_FLASH_MS);
    void speakPictogram(step.picto, board.voiceMode);
  };

  const toggleDone = (key: string): void =>
    setDoneKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const handleReorder = (nextKeys: string[]): void => {
    const { stepIds, keyMap } = reorderBoardSteps(board.stepIds, steps, nextKeys);
    // Done state follows the pictogram into its new slot.
    setDoneKeys(
      (prev) =>
        new Set(
          [...prev].flatMap((k) => {
            const nextKey = keyMap.get(k);
            return nextKey ? [nextKey] : [];
          }),
        ),
    );
    setStepIds.mutate({ boardId: board.id, update: () => stepIds });
  };

  const currentIndex = steps.findIndex((s) => !doneKeys.has(s.key));
  const current = currentIndex === -1 ? null : steps[currentIndex];
  const title = current
    ? kidCopy.sequence.progress(currentIndex + 1, steps.length)
    : kidCopy.sequence.allDone;
  const allDone = steps.length > 0 && !current;

  const renderTile = (step: BoardStep, drag?: DragBindings): JSX.Element => (
    <SequenceTile
      step={step}
      labelsVisible={board.labelsVisible}
      isSpeaking={speakingKey === step.key}
      isDone={doneKeys.has(step.key)}
      isCurrent={current?.key === step.key}
      onTap={() => announce(step)}
      onToggleDone={() => toggleDone(step.key)}
      drag={drag}
    />
  );

  return (
    <KidModeLayout
      eyebrow={board.name.toUpperCase()}
      title={steps.length === 0 ? '' : title}
      titleSize="large"
      {...(allDone
        ? { logoTint: 'sage', logoTintInk: 'sage-ink', logoContent: <CheckIcon size={22} /> }
        : {})}
      onExit={onExit}
    >
      {steps.length === 0 ? (
        <EmptyState title={kidCopy.emptyBoard.title} body={kidCopy.emptyBoard.body} />
      ) : (
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
      )}
    </KidModeLayout>
  );
};
