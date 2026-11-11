import type { JSX } from 'react';

import { rovingKeyDown } from '../rovingKeys';
import styles from './Segmented.module.css';

interface SegmentedOption<V extends string> {
  value: V;
  label: string;
  sub?: string;
}

interface SegmentedProps<V extends string> {
  label: string;
  value: V;
  onChange: (next: V) => void;
  options: readonly SegmentedOption<V>[];
}

export const Segmented = <V extends string>({
  label,
  value,
  onChange,
  options,
}: SegmentedProps<V>): JSX.Element => (
  <div
    className={styles.segmented}
    role="radiogroup"
    aria-label={label}
    onKeyDown={(e) =>
      rovingKeyDown(
        e,
        'radio',
        options.map((o) => o.value),
        value,
        onChange,
      )
    }
  >
    {options.map((o) => {
      const active = value === o.value;
      return (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={active}
          tabIndex={active ? 0 : -1}
          className={[styles.option, active && styles.active].filter(Boolean).join(' ')}
          onClick={() => {
            if (active) return;
            onChange(o.value);
          }}
        >
          <span>{o.label}</span>
          {active && o.sub && <span className={styles.sub}>{o.sub}</span>}
        </button>
      );
    })}
  </div>
);
