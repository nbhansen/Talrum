import type { JSX } from 'react';

import type { Pictogram } from '@/types/domain';

import { PictogramMedia } from './PictogramMedia';
import styles from './PictoTile.module.css';

interface PictoCardProps {
  picto: Pictogram;
  size: number;
  showLabel?: boolean;
  selected?: boolean;
}

/** The non-interactive half; `<PictoTile>` wraps it in a button. */
export const PictoCard = ({
  picto,
  size,
  showLabel = true,
  selected = false,
}: PictoCardProps): JSX.Element => {
  const labelSize = Math.max(13, size * 0.11);
  return (
    <div className={styles.tile} style={{ width: size }}>
      <PictogramMedia picto={picto} size={size} selected={selected} labelShown={showLabel} />
      {showLabel && (
        <span className={styles.label} style={{ fontSize: labelSize, maxWidth: size }}>
          {picto.label}
        </span>
      )}
    </div>
  );
};
