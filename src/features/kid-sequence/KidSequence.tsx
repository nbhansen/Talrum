import { type JSX, useState } from 'react';

import { getPictogram } from '@/data/pictograms';
import { KidModeLayout } from '@/features/kid-mode/KidModeLayout';
import { useReducedMotion } from '@/lib/useReducedMotion';
import type { Board } from '@/types/domain';
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, SpeakerIcon } from '@/ui/icons';
import { PictogramMedia } from '@/ui/PictoTile/PictogramMedia';

import styles from './KidSequence.module.css';
import { NextUpColumn } from './NextUpColumn';

interface KidSequenceProps {
  board: Board;
  onExit: () => void;
}

const CELEBRATION_MS = 700;
const SPEAK_FLASH_MS = 500;

export const KidSequence = ({ board, onExit }: KidSequenceProps): JSX.Element => {
  const steps = board.stepIds.map(getPictogram);
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState<ReadonlySet<number>>(new Set());
  const [celebrate, setCelebrate] = useState(false);
  const [speakFlash, setSpeakFlash] = useState(false);
  const reducedMotion = useReducedMotion();

  const step = steps[index];
  if (!step) {
    return (
      <KidModeLayout eyebrow={board.name.toUpperCase()} title="All done!" onExit={onExit}>
        <></>
      </KidModeLayout>
    );
  }

  const upcoming = steps.slice(index + 1, index + 3);

  const advance = (): void => {
    if (reducedMotion) {
      setDone((prev) => new Set(prev).add(index));
      if (index < steps.length - 1) setIndex(index + 1);
      return;
    }
    setDone((prev) => new Set(prev).add(index));
    setCelebrate(true);
    setTimeout(() => {
      setCelebrate(false);
      if (index < steps.length - 1) setIndex((i) => i + 1);
    }, CELEBRATION_MS);
  };

  const speak = (): void => {
    setSpeakFlash(true);
    setTimeout(() => setSpeakFlash(false), SPEAK_FLASH_MS);
    // TODO(phase 3): wire to SpeechSynthesis / recorded clip playback.
  };

  return (
    <KidModeLayout
      eyebrow={board.name.toUpperCase()}
      title="Hi Liam — what's next?"
      onExit={onExit}
    >
      <ProgressDots steps={steps.length} current={index} done={done} />
      <div className={styles.stage}>
        <button
          type="button"
          className={styles.navBtn}
          onClick={() => index > 0 && setIndex(index - 1)}
          disabled={index === 0}
          aria-label="Previous"
        >
          <ArrowLeftIcon size={28} />
        </button>

        <div className={styles.nowColumn}>
          <div className={styles.nowBadge}>NOW</div>
          <button
            type="button"
            onClick={speak}
            className={[styles.nowCard, celebrate && styles.nowCardCelebrate]
              .filter(Boolean)
              .join(' ')}
          >
            <div style={{ position: 'relative' }}>
              <PictogramMedia picto={step} size={360} className={styles.nowMedia} />
              <div
                className={[styles.speakBadge, speakFlash && styles.speakBadgeActive]
                  .filter(Boolean)
                  .join(' ')}
              >
                <SpeakerIcon size={24} />
              </div>
            </div>
            <div className={styles.nowLabel}>{step.label}</div>
          </button>
          <button type="button" className={styles.doneBtn} onClick={advance}>
            <span className={styles.doneCheck}>
              <CheckIcon size={14} />
            </span>
            {index === steps.length - 1 ? 'All done!' : 'Done — next'}
          </button>
          {celebrate && (
            <div className={styles.celebration}>
              <div className={styles.celebrationBubble}>
                <CheckIcon size={80} />
              </div>
            </div>
          )}
        </div>

        <NextUpColumn upcoming={upcoming} />

        <button
          type="button"
          className={styles.navBtn}
          onClick={() => index < steps.length - 1 && setIndex(index + 1)}
          disabled={index >= steps.length - 1}
          aria-label="Next"
        >
          <ArrowRightIcon size={28} />
        </button>
      </div>
    </KidModeLayout>
  );
};

interface ProgressDotsProps {
  steps: number;
  current: number;
  done: ReadonlySet<number>;
}

const ProgressDots = ({ steps, current, done }: ProgressDotsProps): JSX.Element => (
  <div className={styles.progressDots} style={{ padding: '0 40px 8px', justifyContent: 'center' }}>
    {Array.from({ length: steps }).map((_, idx) => {
      const isCurrent = idx === current;
      const isDone = done.has(idx);
      const width = isCurrent ? 26 : 10;
      return (
        <span
          key={idx}
          className={[styles.dot, isCurrent && styles.dotCurrent, isDone && styles.dotDone]
            .filter(Boolean)
            .join(' ')}
          style={{ width }}
        />
      );
    })}
  </div>
);
