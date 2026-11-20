import type { JSX, ReactNode } from 'react';

import { type LogoTile, TalrumLogo } from '@/layouts/TalrumLogo';
import { getKidCopy } from '@/lib/kidCopy';
import { LockIcon } from '@/ui/icons';

import styles from './KidModeLayout.module.css';

interface KidModeLayoutProps {
  eyebrow: string;
  title: string;
  titleSize?: 'default' | 'large';
  onExit: () => void;
  logo?: LogoTile | undefined;
  children: ReactNode;
}

export const KidModeLayout = ({
  eyebrow,
  title,
  titleSize = 'default',
  onExit,
  logo,
  children,
}: KidModeLayoutProps): JSX.Element => (
  <div className={styles.layout}>
    <div className={styles.topBar}>
      <div className={styles.titleBlock}>
        <TalrumLogo tile={logo} />
        <div>
          <div className={styles.eyebrow}>{eyebrow}</div>
          <div
            className={[styles.title, titleSize === 'large' && styles.titleLarge]
              .filter(Boolean)
              .join(' ')}
          >
            {title}
          </div>
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
