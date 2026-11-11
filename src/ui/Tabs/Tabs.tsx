import type { JSX, ReactNode } from 'react';

import { rovingKeyDown } from '../rovingKeys';
import styles from './Tabs.module.css';

export interface TabItem<Id extends string> {
  id: Id;
  label: string;
  sub?: string;
}

interface TabsProps<Id extends string> {
  /** Links the tabs to their `TabPanel`. */
  id: string;
  items: readonly TabItem<Id>[];
  value: Id;
  onChange: (next: Id) => void;
}

export const Tabs = <Id extends string>({
  id,
  items,
  value,
  onChange,
}: TabsProps<Id>): JSX.Element => (
  <div
    className={styles.tabs}
    role="tablist"
    onKeyDown={(e) =>
      rovingKeyDown(
        e,
        'tab',
        items.map((t) => t.id),
        value,
        onChange,
      )
    }
  >
    {items.map((t) => {
      const active = t.id === value;
      return (
        <button
          key={t.id}
          type="button"
          role="tab"
          id={`${id}-${t.id}`}
          aria-controls={`${id}-panel`}
          aria-selected={active}
          tabIndex={active ? 0 : -1}
          className={[styles.tab, active && styles.tabActive].filter(Boolean).join(' ')}
          onClick={() => onChange(t.id)}
        >
          {t.label}
          {t.sub && <span className={styles.tabSub}>{t.sub}</span>}
        </button>
      );
    })}
  </div>
);

interface TabPanelProps {
  tabsId: string;
  value: string;
  className?: string | undefined;
  children: ReactNode;
}

export const TabPanel = ({ tabsId, value, className, children }: TabPanelProps): JSX.Element => (
  <div
    role="tabpanel"
    id={`${tabsId}-panel`}
    aria-labelledby={`${tabsId}-${value}`}
    className={className}
  >
    {children}
  </div>
);
