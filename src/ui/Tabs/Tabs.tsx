import type { JSX } from 'react';

import styles from './Tabs.module.css';

export interface TabItem<Id extends string> {
  id: Id;
  label: string;
  sub?: string;
}

interface TabsProps<Id extends string> {
  items: readonly TabItem<Id>[];
  value: Id;
  onChange: (next: Id) => void;
}

export const Tabs = <Id extends string>({ items, value, onChange }: TabsProps<Id>): JSX.Element => (
  <div className={styles.tabs} role="tablist">
    {items.map((t) => {
      const active = t.id === value;
      return (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={active}
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
