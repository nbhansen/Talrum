import type { JSX, ReactNode } from 'react';

import { TalrumLogo } from '@/layouts/TalrumLogo';
import { kidCopy } from '@/lib/kidCopy';
import type { ColorToken } from '@/theme/tokens';
import { LockIcon } from '@/ui/icons';

import styles from './KidModeLayout.module.css';

interface KidModeLayoutProps {
  eyebrow: string;
  title: string;
  titleSize?: 'default' | 'large';
  onExit: () => void;
  logoTint?: ColorToken;
  logoTintInk?: ColorToken;
  logoContent?: ReactNode;
  children: ReactNode;
}

export const KidModeLayout = ({
  eyebrow,
  title,
  titleSize = 'default',
  onExit,
  logoTint,
  logoTintInk,
  logoContent,
  children,
}: KidModeLayoutProps): JSX.Element => (
  <div className={styles.layout}>
    <div className={styles.topBar}>
      <div className={styles.titleBlock}>
        <TalrumLogo
          {...(logoTint ? { tile: logoTint } : {})}
          {...(logoTintInk ? { tileInk: logoTintInk } : {})}
        >
          {logoContent}
        </TalrumLogo>
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
        {kidCopy.exitButton}
      </button>
    </div>
    <div className={styles.body}>{children}</div>
  </div>
);
