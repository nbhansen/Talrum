import type { JSX, MouseEventHandler } from 'react';

import type { Pictogram } from '@/types/domain';

import { PictoCard } from './PictoCard';
import styles from './PictoTile.module.css';

interface PictoTileProps {
  picto: Pictogram;
  size: number;
  selected?: boolean;
  onClick: MouseEventHandler<HTMLButtonElement>;
}

/**
 * A `<button>` around a `<PictoCard>`. With no action, or inside an interactive
 * ancestor, use `<PictoCard>` directly.
 */
export const PictoTile = ({
  picto,
  size,
  selected = false,
  onClick,
}: PictoTileProps): JSX.Element => (
  <button type="button" className={styles.tileButton} onClick={onClick}>
    <PictoCard picto={picto} size={size} selected={selected} />
  </button>
);
