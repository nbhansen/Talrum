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
}

export const Select = <V extends string>({
  label,
  value,
  onChange,
  options,
}: SelectProps<V>): JSX.Element => (
  <label className={styles.wrapper}>
    <span className={styles.label}>{label}:</span>
    <select
      className={styles.native}
      value={value}
      onChange={(e) => onChange(e.target.value as V)}
    >
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
