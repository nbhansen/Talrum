import { Fragment, type JSX, type MouseEventHandler } from 'react';

import { kindLabel } from '@/lib/boardKindVocab';
import { buildBoardSteps } from '@/lib/boardSteps';
import { formatUpdated } from '@/lib/formatUpdated';
import { usePictogramsById } from '@/lib/queries/pictograms';
import { cssVar, inkForAccent } from '@/theme/tokens';
import type { Board } from '@/types/domain';
import { StepArrowIcon } from '@/ui/icons';
import { PictoCard } from '@/widgets/PictoTile/PictoCard';

import styles from './BoardCard.module.css';

interface BoardCardProps {
  board: Board;
  onClick: MouseEventHandler<HTMLButtonElement>;
}

const PREVIEW_LIMIT = 4;

export const BoardCard = ({ board, onClick }: BoardCardProps): JSX.Element => {
  const pictogramsById = usePictogramsById();
  const previewSteps = buildBoardSteps(board.stepIds.slice(0, PREVIEW_LIMIT), pictogramsById);

  return (
    <button type="button" className={styles.card} onClick={onClick}>
      <div className={styles.topRow}>
        <span
          className={styles.pill}
          style={{ background: cssVar(board.accent), color: cssVar(inkForAccent(board.accent)) }}
        >
          {kindLabel(board.kind)} · {board.stepIds.length}
        </span>
        {board.serverUpdatedAt && (
          <span className={styles.updated}>{formatUpdated(board.serverUpdatedAt)}</span>
        )}
      </div>
      <span className={styles.name}>{board.name}</span>
      <div className={styles.preview}>
        {previewSteps.map((step, i) => (
          <Fragment key={step.key}>
            <PictoCard picto={step.picto} size={64} showLabel={false} />
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
