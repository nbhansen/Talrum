import type { JSX, ReactNode } from 'react';

import type { ColorToken } from '@/theme/tokens';
import { cssVar } from '@/theme/tokens';

import styles from './TalrumLogo.module.css';

interface TalrumLogoProps {
  size?: number;
  tile?: ColorToken;
  tileInk?: ColorToken;
  /** Custom content (e.g. an icon) rendered inside the tile. Defaults to the rotated diamond. */
  children?: ReactNode;
}

export const TalrumLogo = ({
  size = 44,
  tile = 'sage',
  tileInk = 'sage-ink',
  children,
}: TalrumLogoProps): JSX.Element => {
  const diamondSize = Math.round(size * 0.41);
  return (
    <div
      className={styles.logo}
      style={{ width: size, height: size, background: cssVar(tile) }}
      aria-label="Talrum"
    >
      {children ?? (
        <div
          className={styles.diamond}
          style={{
            width: diamondSize,
            height: diamondSize,
            background: cssVar(tileInk),
          }}
        />
      )}
    </div>
  );
};
