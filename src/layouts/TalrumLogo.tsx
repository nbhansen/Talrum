import type { JSX, ReactNode } from 'react';

import type { ColorToken } from '@/theme/tokens';
import { cssVar } from '@/theme/tokens';

import styles from './TalrumLogo.module.css';
import { TalrumMark } from './TalrumMark';

/** A tinted tile that repurposes the logo slot as a marker, e.g. KidChoice's connector. */
export interface LogoTile {
  tint: ColorToken;
  content: ReactNode;
}

interface TalrumLogoProps {
  size?: number;
  tile?: LogoTile | undefined;
}

export const TalrumLogo = ({ size = 44, tile }: TalrumLogoProps): JSX.Element => {
  if (!tile) return <TalrumMark size={size} />;
  return (
    <div
      className={styles.logo}
      style={{ width: size, height: size, background: cssVar(tile.tint) }}
      aria-hidden="true"
    >
      {tile.content}
    </div>
  );
};
