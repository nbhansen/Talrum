import { type JSX, useState } from 'react';

import { KidModeLayout } from '@/layouts/KidModeLayout';
import { usePictogramsById } from '@/lib/queries/pictograms';
import { speakPictogram } from '@/lib/voiceOut';
import { accentForIndex, cssVar } from '@/theme/tokens';
import type { Board, Pictogram } from '@/types/domain';
import { EmptyState } from '@/ui/EmptyState/EmptyState';
import { CheckIcon, ChoiceConnectorIcon } from '@/ui/icons';
import { PictogramMedia } from '@/ui/PictoTile/PictogramMedia';

import styles from './KidChoice.module.css';

interface KidChoiceProps {
  board: Board;
  onExit: () => void;
}

export const KidChoice = ({ board, onExit }: KidChoiceProps): JSX.Element => {
  const pictogramsById = usePictogramsById();
  const options: Pictogram[] = board.stepIds
    .map((id) => pictogramsById.get(id))
    .filter((p): p is Pictogram => Boolean(p));
  const [pickedId, setPickedId] = useState<string | null>(null);
  const pickedLabel = options.find((o) => o.id === pickedId)?.label;

  const pick = (p: Pictogram): void => {
    setPickedId(p.id);
    void speakPictogram(p, board.voiceMode);
  };

  return (
    <KidModeLayout
      eyebrow={board.name.toUpperCase()}
      title="Pick one"
      titleSize="large"
      onExit={onExit}
      logoTint="sky"
      logoTintInk="sky-ink"
      logoContent={<ChoiceConnectorIcon size={22} />}
    >
      {options.length === 0 ? (
        <EmptyState title="This board is empty" body="Ask a grown-up to add some pictograms." />
      ) : (
        <>
          <div className={styles.choices}>
            {options.map((p, idx) => {
              const accent = accentForIndex(idx);
              const isPicked = pickedId === p.id;
              const isOther = pickedId !== null && !isPicked;
              const markerStyle = {
                background: cssVar(accent.bg),
                color: cssVar(accent.ink),
              };
              const choiceStyle = isPicked ? { borderColor: cssVar(accent.ink) } : {};
              const mediaStyle = {
                background: p.style === 'photo' ? 'var(--tal-surface-alt)' : cssVar(accent.bg),
              };
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => pick(p)}
                  className={[
                    styles.choice,
                    isPicked && styles.choicePicked,
                    isOther && styles.choiceDim,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={choiceStyle}
                  aria-label={
                    board.labelsVisible ? undefined : `${String.fromCharCode(65 + idx)} ${p.label}`
                  }
                >
                  <span className={styles.marker} style={markerStyle}>
                    {String.fromCharCode(65 + idx)}
                  </span>
                  <div className={styles.mediaWrap} style={mediaStyle}>
                    <PictogramMedia picto={p} size={260} radius="0" />
                    {isPicked && (
                      <div
                        className={styles.pickedBadge}
                        style={{ background: cssVar(accent.ink) }}
                      >
                        <CheckIcon size={26} />
                      </div>
                    )}
                  </div>
                  {board.labelsVisible && <span className={styles.label}>{p.label}</span>}
                </button>
              );
            })}
          </div>
          <div className={styles.bottom}>
            {pickedLabel ? (
              <button type="button" className={styles.confirmBtn}>
                <span className={styles.confirmCheck}>
                  <CheckIcon size={18} />
                </span>
                Let&apos;s go to {pickedLabel}
              </button>
            ) : (
              <span className={styles.placeholder}>Tap one to choose ✨</span>
            )}
          </div>
        </>
      )}
    </KidModeLayout>
  );
};
