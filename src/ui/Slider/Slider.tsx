import type { JSX } from 'react';

import styles from './Slider.module.css';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (next: number) => void;
}

export const Slider = ({ label, value, min, max, step, onChange }: SliderProps): JSX.Element => (
  <label className={styles.row}>
    <span className={styles.label}>{label}</span>
    <input
      type="range"
      className={styles.range}
      min={min}
      max={max}
      step={step}
      value={value}
      aria-valuetext={value.toFixed(2)}
      onChange={(e) => onChange(Number(e.target.value))}
    />
    <span className={styles.value} aria-hidden="true">
      {value.toFixed(2)}
    </span>
  </label>
);
