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
  /**
   * Outer element. Defaults to 'button' (interactive tile). Use 'div' when
   * the tile is rendered inside an existing interactive element (e.g. the
   * preview strip on a BoardCard), to avoid nested-button invalid HTML.
   */
  as?: 'button' | 'div';
  /** Button-level style override (layout only — don't theme here). */
  style?: CSSProperties;
}

export const PictoTile = ({
  picto,
  size = 140,
  showLabel = true,
  selected = false,
  onClick,
  as = 'button',
  style,
}: PictoTileProps): JSX.Element => {
  const labelSize = Math.max(13, size * 0.11);
  const tileStyle: CSSProperties = { width: size, ...style };
  const body = (
    <>
      <PictogramMedia picto={picto} size={size} selected={selected} />
      {showLabel && (
        <span className={styles.label} style={{ fontSize: labelSize, maxWidth: size }}>
          {picto.label}
        </span>
      )}
    </>
  );
  if (as === 'div') {
    return (
      <div className={styles.tile} style={tileStyle}>
        {body}
      </div>
    );
  }
  return (
    <button type="button" className={styles.tile} onClick={onClick} style={tileStyle}>
      {body}
    </button>
  );
};
