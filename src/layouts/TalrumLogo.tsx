import type { JSX, ReactNode } from 'react';

import type { ColorToken } from '@/theme/tokens';
import { cssVar } from '@/theme/tokens';

import styles from './TalrumLogo.module.css';
import { TalrumMark } from './TalrumMark';

interface TalrumLogoProps {
  size?: number;
  /** Override the default brand mark with a tinted tile — used by screens
   * that repurpose the logo slot as a semantic marker (e.g. the choice
   * connector on KidChoice). */
  tile?: ColorToken;
  tileInk?: ColorToken;
  /** Custom content rendered inside an override tile. Ignored when no
   * override is requested. */
  children?: ReactNode;
}

export const TalrumLogo = ({
  size = 44,
  tile,
  tileInk,
  children,
}: TalrumLogoProps): JSX.Element => {
  const override = tile !== undefined || children !== undefined;
  if (!override) return <TalrumMark size={size} />;

  const diamondSize = Math.round(size * 0.41);
  return (
    <div
      className={styles.logo}
      style={{ width: size, height: size, background: tile ? cssVar(tile) : undefined }}
      aria-label="Talrum"
    >
      {children ?? (
        <div
          className={styles.diamond}
          style={{
            width: diamondSize,
            height: diamondSize,
            background: tileInk ? cssVar(tileInk) : undefined,
          }}
        />
      )}
    </div>
  );
};
