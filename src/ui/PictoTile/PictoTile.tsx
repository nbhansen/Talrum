import type { CSSProperties, JSX, MouseEventHandler } from 'react';

import type { Pictogram } from '@/types/domain';

import { PictogramMedia } from './PictogramMedia';
import styles from './PictoTile.module.css';

interface PictoTileProps {
  picto: Pictogram;
  size?: number;
  showLabel?: boolean;
  selected?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  /** Button-level style override (layout only — don't theme here). */
  style?: CSSProperties;
}

export const PictoTile = ({
  picto,
  size = 140,
  showLabel = true,
  selected = false,
  onClick,
  style,
}: PictoTileProps): JSX.Element => {
  const labelSize = Math.max(13, size * 0.11);
  const buttonStyle: CSSProperties = { width: size, ...style };
  return (
    <button type="button" className={styles.tile} onClick={onClick} style={buttonStyle}>
      <PictogramMedia picto={picto} size={size} selected={selected} />
      {showLabel && (
        <span
          className={styles.label}
          style={{ fontSize: labelSize, maxWidth: size }}
        >
          {picto.label}
        </span>
      )}
    </button>
  );
};
