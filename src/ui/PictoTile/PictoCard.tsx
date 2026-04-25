import type { CSSProperties, JSX } from 'react';

import type { Pictogram } from '@/types/domain';

import styles from './PictoTile.module.css';
import { PictogramMedia } from './PictogramMedia';

interface PictoCardProps {
  picto: Pictogram;
  size?: number;
  showLabel?: boolean;
  selected?: boolean;
  /** Layout-only override (don't theme here). */
  style?: CSSProperties;
}

/**
 * Non-interactive pictogram card: media + label, no `<button>`. Use this
 * inside an existing interactive ancestor (e.g. the preview strip on a
 * BoardCard, where the card itself is the button). For a standalone
 * tappable tile, use `<PictoTile>` instead.
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
