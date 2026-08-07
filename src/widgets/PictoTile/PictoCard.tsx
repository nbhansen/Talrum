import type { CSSProperties, JSX } from 'react';

import type { Pictogram } from '@/types/domain';

import { PictogramMedia } from './PictogramMedia';
import styles from './PictoTile.module.css';

interface PictoCardProps {
  picto: Pictogram;
  size?: number;
  showLabel?: boolean;
  selected?: boolean;
  /** Layout-only override (don't theme here). */
  style?: CSSProperties;
}

/**
 * The non-interactive half: use it inside an existing interactive ancestor,
 * where `<PictoTile>`'s nested button would be invalid HTML.
 */
export const PictoCard = ({
  picto,
  size = 140,
  showLabel = true,
  selected = false,
  style,
}: PictoCardProps): JSX.Element => {
  const labelSize = Math.max(13, size * 0.11);
  return (
    <div className={styles.tile} style={{ width: size, ...style }}>
      <PictogramMedia picto={picto} size={size} selected={selected} />
      {showLabel && (
        <span className={styles.label} style={{ fontSize: labelSize, maxWidth: size }}>
          {picto.label}
        </span>
      )}
    </div>
  );
};
