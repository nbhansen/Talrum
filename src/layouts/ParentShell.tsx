import type { JSX, ReactNode } from 'react';

import type { NavIconName } from '@/ui/icons';
import { LockIcon, NavIcon } from '@/ui/icons';
import { OfflineIndicator } from '@/widgets/OfflineIndicator/OfflineIndicator';

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
  /** Omitted when no board qualifies, which renders the button disabled. */
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
          <button type="button" className={styles.kidBtn} onClick={onKidMode} disabled={!onKidMode}>
            <LockIcon size={22} />
            <span>KID</span>
          </button>
        </div>
      </aside>
      <main className={styles.main}>
        {/*
          Outside the header, so sync status cannot depend on whether a page
          passes a `title`. In the header's slot it was invisible on the board
          builder — the screen where nearly every write is made, and Retry and
          Discard exist nowhere else (#354). `:empty` collapses the wrapper.
        */}
        <div className={styles.status}>
          <OfflineIndicator />
        </div>
        {title && (
          <header className={styles.header}>
            <div>
              <h1 className={styles.title}>{title}</h1>
              {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
            </div>
            <div className={styles.headerRight}>{right}</div>
          </header>
        )}
        <div className={`${styles.body} tal-scroll`}>{children}</div>
      </main>
    </div>
  );
};
