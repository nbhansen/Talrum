import type { InputHTMLAttributes, JSX, SelectHTMLAttributes } from 'react';

import styles from './TextField.module.css';

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  label: string;
  inputClassName?: string | undefined;
}

export const TextField = ({
  label,
  inputClassName,
  ...inputProps
}: TextFieldProps): JSX.Element => (
  <label className={styles.field}>
    <span className={styles.label}>{label}</span>
    <input
      {...inputProps}
      className={inputClassName ? `${styles.input} ${inputClassName}` : styles.input}
    />
  </label>
);

interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'> {
  label: string;
}

export const SelectField = ({ label, ...selectProps }: SelectFieldProps): JSX.Element => (
  <label className={styles.field}>
    <span className={styles.label}>{label}</span>
    <select {...selectProps} className={styles.input} />
  </label>
);
