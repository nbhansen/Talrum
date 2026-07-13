import type { JSX } from 'react';

import { kindTileMarker } from '@/lib/boardKindVocab';
import type { BoardKind, Pictogram } from '@/types/domain';
import { PencilIcon, XIcon } from '@/ui/icons';
import type { DragBindings } from '@/ui/Reorderable/Reorderable';
import { PictoTile } from '@/widgets/PictoTile/PictoTile';

import styles from './StepTile.module.css';

interface StepTileProps {
  picto: Pictogram;
  index: number;
  kind: BoardKind;
  labelsVisible: boolean;
  onRemove: () => void;
  /** Optional — when provided, a pencil button opens the edit sheet for this picto. */
  onEdit?: () => void;
  drag: DragBindings;
}

export const StepTile = ({
  picto,
  index,
  kind,
  labelsVisible,
  onRemove,
  onEdit,
  drag,
}: StepTileProps): JSX.Element => {
  const marker = kindTileMarker(kind, index);
  // dnd-kit render-prop bindings: `setNodeRef` is a callback ref setter and
  // `style`/`attributes`/`listeners` are plain values from useSortable — none
  // are React refs. react-hooks 7's `refs` rule misfires on the whole `drag`
  // object because of the `setNodeRef` name; this is the documented dnd-kit usage.
  /* eslint-disable react-hooks/refs */
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
      {onEdit && (
        <button
          type="button"
          className={styles.edit}
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={`Edit ${picto.label}`}
          title="Edit"
        >
          <PencilIcon size={11} />
        </button>
      )}
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
  /* eslint-enable react-hooks/refs */
};
