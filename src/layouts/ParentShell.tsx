import type { JSX, ReactNode } from 'react';

import type { NavIconName } from '@/ui/icons';
import { LockIcon, NavIcon } from '@/ui/icons';

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
  onKidMode?: () => void;
  onSignOut?: () => void;
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  /** Undefined renders a blank avatar while the session is loading. */
  userInitial?: string | undefined;
  children: ReactNode;
}

export const ParentShell = ({
  active,
  onNav,
  onKidMode,
  onSignOut,
  title,
  subtitle,
  right,
  userInitial,
  children,
}: ParentShellProps): JSX.Element => (
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
          onClick={onSignOut}
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
          {right && <div>{right}</div>}
        </header>
      )}
      <div className={`${styles.body} tal-scroll`}>{children}</div>
    </main>
  </div>
);
