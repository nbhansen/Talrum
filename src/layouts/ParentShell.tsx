import type { JSX, ReactNode } from 'react';

import { useSignOut, useUserInitial } from '@/lib/auth/session';
import type { NavIconName } from '@/ui/icons';
import { LockIcon, NavIcon } from '@/ui/icons';
import { OfflineIndicator } from '@/ui/OfflineIndicator/OfflineIndicator';

import styles from './ParentShell.module.css';
import { TalrumLogo } from './TalrumLogo';

export type ParentNavKey = 'home' | 'library' | 'kids' | 'settings';

interface NavItem {
  id: ParentNavKey;
  label: string;
  glyph: NavIconName;
}

const NAV: readonly NavItem[] = [
  { id: 'home', label: 'Boards', glyph: 'grid' },
  { id: 'library', label: 'Library', glyph: 'lib' },
  { id: 'kids', label: 'Kids', glyph: 'kid' },
  { id: 'settings', label: 'Settings', glyph: 'cog' },
];

interface ParentShellProps {
  active?: ParentNavKey;
  onNav?: (id: ParentNavKey) => void;
  /**
   * Page-specific kid-mode entry point. Each route picks the right board
   * (e.g. ParentHome → first sequence board; BoardBuilder → this board).
   * Sign-out and avatar pull from session and don't need props.
   */
  onKidMode?: () => void;
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
}

export const ParentShell = ({
  active,
  onNav,
  onKidMode,
  title,
  subtitle,
  right,
  children,
}: ParentShellProps): JSX.Element => {
  const signOut = useSignOut();
  const userInitial = useUserInitial();
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <TalrumLogo />
        <nav className={styles.nav}>
          {NAV.map((item) => {
            const isActive = active === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={[styles.navItem, isActive && styles.navItemActive]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => onNav?.(item.id)}
              >
                <NavIcon name={item.glyph} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className={styles.bottom}>
          <button type="button" className={styles.kidBtn} onClick={onKidMode}>
            <LockIcon size={22} />
            <span>KID</span>
          </button>
          <button
            type="button"
            className={styles.avatar}
            onClick={() => void signOut()}
            title="Sign out"
            aria-label="Sign out"
          >
            {userInitial ?? ''}
          </button>
        </div>
      </aside>
      <main className={styles.main}>
        {title && (
          <header className={styles.header}>
            <div>
              <h1 className={styles.title}>{title}</h1>
              {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
            </div>
            <div className={styles.headerRight}>
              <OfflineIndicator />
              {right}
            </div>
          </header>
        )}
        <div className={`${styles.body} tal-scroll`}>{children}</div>
      </main>
    </div>
  );
};
