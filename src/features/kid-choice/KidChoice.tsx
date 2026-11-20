import { type JSX, useState } from 'react';

import { KidModeLayout } from '@/layouts/KidModeLayout';
import { buildBoardSteps } from '@/lib/boardSteps';
import { getKidCopy } from '@/lib/kidCopy';
import { usePictogramsById } from '@/lib/queries/pictograms';
import { speakPictogram } from '@/lib/voiceOut';
import { accentForIndex, cssVar } from '@/theme/tokens';
import type { Board, Pictogram } from '@/types/domain';
import { EmptyState } from '@/ui/EmptyState/EmptyState';
import { CheckIcon, ChoiceConnectorIcon } from '@/ui/icons';
import { PictogramMedia } from '@/widgets/PictoTile/PictogramMedia';

import styles from './KidChoice.module.css';

interface KidChoiceProps {
  board: Board;
  onExit: () => void;
}

export const KidChoice = ({ board, onExit }: KidChoiceProps): JSX.Element => {
  const kidCopy = getKidCopy();
  const pictogramsById = usePictogramsById();
  const options = buildBoardSteps(board.stepIds, pictogramsById);
  // Selection is keyed by slot, not pictogram id: a choice board may list the
  // same pictogram twice, and an id-keyed selection would mark every identical
  // tile as picked (#273).
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const pickedPicto = options.find((o) => o.key === pickedKey)?.picto ?? null;

  const speakPicked = (p: Pictogram): void => {
    void speakPictogram(p, board.voiceMode);
  };

  const pick = (key: string, p: Pictogram): void => {
    setPickedKey(key);
    speakPicked(p);
  };

  return (
    <KidModeLayout
      eyebrow={board.name.toUpperCase()}
      title={kidCopy.choice.title}
      titleSize="large"
      onExit={onExit}
      logoTint="sky"
      logoTintInk="sky-ink"
      logoContent={<ChoiceConnectorIcon size={22} />}
    >
      {options.length === 0 ? (
        <EmptyState title={kidCopy.emptyBoard.title} body={kidCopy.emptyBoard.body} />
      ) : (
        <>
          <div className={styles.choices}>
            {options.map(({ key, picto: p }, idx) => {
              const accent = accentForIndex(idx);
              const isPicked = pickedKey === key;
              const isOther = pickedKey !== null && !isPicked;
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
                  key={key}
                  type="button"
                  onClick={() => pick(key, p)}
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
                    <PictogramMedia picto={p} size={260} radius="0" labelShown />
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
            {pickedPicto ? (
              <button
                type="button"
                className={styles.confirmBtn}
                onClick={() => speakPicked(pickedPicto)}
                aria-label={kidCopy.choice.hearAgain(pickedPicto.label)}
              >
                <span className={styles.confirmCheck}>
                  <CheckIcon size={18} />
                </span>
                {kidCopy.choice.letsGoTo(pickedPicto.label)}
              </button>
            ) : (
              <span className={styles.placeholder}>{kidCopy.choice.tapPlaceholder}</span>
            )}
          </div>
        </>
      )}
    </KidModeLayout>
  );
};
