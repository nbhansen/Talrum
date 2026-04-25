import type { JSX } from 'react';

import type { BoardKind, Pictogram } from '@/types/domain';
import { XIcon } from '@/ui/icons';
import { PictoTile } from '@/ui/PictoTile/PictoTile';
import type { DragBindings } from '@/ui/Reorderable/Reorderable';

import styles from './StepTile.module.css';

interface StepTileProps {
  picto: Pictogram;
  index: number;
  kind: BoardKind;
  labelsVisible: boolean;
  onRemove: () => void;
  drag: DragBindings;
}

export const StepTile = ({
  picto,
  index,
  kind,
  labelsVisible,
  onRemove,
  drag,
}: StepTileProps): JSX.Element => {
  const marker =
    kind === 'sequence' ? `STEP ${index + 1}` : `OPTION ${String.fromCharCode(65 + index)}`;
  return (
    <div
      ref={drag.setNodeRef}
      className={styles.step}
      style={drag.style}
      {...drag.attributes}
      {...drag.listeners}
    >
      <div className={styles.marker}>{marker}</div>
      <div className={styles.body}>
        <PictoTile picto={picto} size={116} showLabel={labelsVisible} />
      </div>
      <button
        type="button"
        className={styles.remove}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label={`Remove ${picto.label}`}
      >
        <XIcon size={10} />
      </button>
    </div>
  );
};
