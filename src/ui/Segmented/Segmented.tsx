import type { JSX } from 'react';

import styles from './Segmented.module.css';

export interface SegmentedOption<V extends string> {
  value: V;
  label: string;
  sub?: string;
}

interface SegmentedProps<V extends string> {
  value: V;
  onChange: (next: V) => void;
  options: readonly SegmentedOption<V>[];
}

export const Segmented = <V extends string>({
  value,
  onChange,
  options,
}: SegmentedProps<V>): JSX.Element => (
  <div className={styles.segmented} role="tablist">
    {options.map((o) => {
      const active = value === o.value;
      return (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={active}
          className={[styles.option, active && styles.active].filter(Boolean).join(' ')}
          onClick={() => onChange(o.value)}
        >
          <span>{o.label}</span>
          {active && o.sub && <span className={styles.sub}>{o.sub}</span>}
        </button>
      );
    })}
  </div>
);
