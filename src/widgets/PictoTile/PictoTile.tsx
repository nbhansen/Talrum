import type { JSX, MouseEventHandler } from 'react';

import type { Pictogram } from '@/types/domain';

import { PictoCard } from './PictoCard';
import styles from './PictoTile.module.css';

interface PictoTileProps {
  picto: Pictogram;
  size?: number;
  selected?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
}

/**
 * A `<button>` around a `<PictoCard>`. Inside an existing interactive ancestor
 * use `<PictoCard>` directly — a nested button is invalid HTML.
 */
export const PictoTile = ({
  picto,
  size = 140,
  selected = false,
  onClick,
}: PictoTileProps): JSX.Element => (
  <button type="button" className={styles.tileButton} onClick={onClick}>
    <PictoCard picto={picto} size={size} selected={selected} />
  </button>
);
