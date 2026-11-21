import type { JSX, ReactNode } from 'react';

import { getKidCopy } from '@/lib/kidCopy';
import { type ColorToken, cssVar } from '@/theme/tokens';
import { LockIcon } from '@/ui/icons';

import styles from './KidModeLayout.module.css';
import { TalrumMark } from './TalrumMark';

/** A tinted tile that repurposes the logo slot as a marker, e.g. KidChoice's connector. */
interface LogoTile {
  tint: ColorToken;
  content: ReactNode;
}

interface KidModeLayoutProps {
  eyebrow: string;
  title: string;
  onExit: () => void;
  logo?: LogoTile | undefined;
  children: ReactNode;
}

export const KidModeLayout = ({
  eyebrow,
  title,
  onExit,
  logo,
  children,
}: KidModeLayoutProps): JSX.Element => (
  <div className={styles.layout}>
    <div className={styles.topBar}>
      <div className={styles.titleBlock}>
        {logo ? (
          <div className={styles.logo} style={{ background: cssVar(logo.tint) }} aria-hidden="true">
            {logo.content}
          </div>
        ) : (
          <TalrumMark />
        )}
        <div>
          <div className={styles.eyebrow}>{eyebrow}</div>
          <div className={styles.title}>{title}</div>
        </div>
      </div>
      <button type="button" className={styles.exit} onClick={onExit}>
        <LockIcon size={14} />
        {getKidCopy().exitButton}
      </button>
    </div>
    <div className={styles.body}>{children}</div>
  </div>
);
