import type { JSX } from 'react';

import { ChevronDownIcon } from '@/ui/icons';

import styles from './Select.module.css';

export interface SelectOption<V extends string> {
  value: V;
  label: string;
}

interface SelectProps<V extends string> {
  label: string;
  value: V;
  onChange: (next: V) => void;
  options: readonly SelectOption<V>[];
  /** `inline` is the toolbar pill; `row` is a settings row with a label column. */
  layout?: 'inline' | 'row';
}

export const Select = <V extends string>({
  label,
  value,
  onChange,
  options,
  layout = 'inline',
}: SelectProps<V>): JSX.Element => (
  <label className={layout === 'row' ? styles.row : styles.wrapper}>
    <span className={styles.label}>{layout === 'row' ? label : `${label}:`}</span>
    <select className={styles.native} value={value} onChange={(e) => onChange(e.target.value as V)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
    <span className={styles.chevron}>
      <ChevronDownIcon />
    </span>
  </label>
);
