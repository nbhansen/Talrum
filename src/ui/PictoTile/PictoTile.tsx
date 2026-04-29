import type { CSSProperties, JSX, MouseEventHandler } from 'react';

import type { Pictogram } from '@/types/domain';

import { PictoCard } from './PictoCard';
import styles from './PictoTile.module.css';

interface PictoTileProps {
  picto: Pictogram;
  size?: number;
  showLabel?: boolean;
  selected?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  /** Layout-only override (don't theme here). */
  style?: CSSProperties;
}

/**
 * Interactive pictogram tile — a `<button>` wrapping a `<PictoCard>`. For
 * use inside an existing interactive ancestor (where a nested button is
 * invalid HTML), use `<PictoCard>` directly.
 */
export const PictoTile = ({
  picto,
  size = 140,
  showLabel = true,
  selected = false,
  onClick,
  style,
}: PictoTileProps): JSX.Element => (
  <button type="button" className={styles.tileButton} onClick={onClick}>
    <PictoCard
      picto={picto}
      size={size}
      showLabel={showLabel}
      selected={selected}
      {...(style ? { style } : {})}
    />
  </button>
);
