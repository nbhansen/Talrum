import { Fragment, type JSX, type MouseEventHandler } from 'react';

import { getPictogram } from '@/data/pictograms';
import { cssVar } from '@/theme/tokens';
import type { Board } from '@/types/domain';
import { StepArrowIcon } from '@/ui/icons';
import { PictoTile } from '@/ui/PictoTile/PictoTile';

import styles from './BoardCard.module.css';

interface BoardCardProps {
  board: Board;
  onClick?: MouseEventHandler<HTMLButtonElement>;
}

const PREVIEW_LIMIT = 4;

export const BoardCard = ({ board, onClick }: BoardCardProps): JSX.Element => {
  const previewSteps = board.stepIds.slice(0, PREVIEW_LIMIT).map(getPictogram);
  const kindLabel = board.kind === 'choice' ? 'Choice' : 'Sequence';
  return (
    <button type="button" className={styles.card} onClick={onClick}>
      <div className={styles.topRow}>
        <span
          className={styles.pill}
          style={{ background: cssVar(board.accent), color: cssVar(board.accentInk) }}
        >
          {kindLabel} · {board.stepIds.length}
        </span>
        <span className={styles.updated}>{board.updatedLabel}</span>
      </div>
      <span className={styles.name}>{board.name}</span>
      <div className={styles.preview}>
        {previewSteps.map((p, i) => (
          <Fragment key={`${p.id}-${i}`}>
            <PictoTile picto={p} size={64} showLabel={false} />
            {i < previewSteps.length - 1 && (
              <span className={styles.previewArrow}>
                <StepArrowIcon size={14} />
              </span>
            )}
          </Fragment>
        ))}
      </div>
    </button>
  );
};
