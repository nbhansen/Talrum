import { forwardRef, type InputHTMLAttributes, type JSX, type SelectHTMLAttributes } from 'react';

import styles from './TextField.module.css';

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  label: string;
  inputClassName?: string | undefined;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  ({ label, inputClassName, ...inputProps }, ref) => (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      <input
        ref={ref}
        {...inputProps}
        className={inputClassName ? `${styles.input} ${inputClassName}` : styles.input}
      />
    </label>
  ),
);
TextField.displayName = 'TextField';

interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'> {
  label: string;
}

export const SelectField = ({ label, ...selectProps }: SelectFieldProps): JSX.Element => (
  <label className={styles.field}>
    <span className={styles.label}>{label}</span>
    <select {...selectProps} className={styles.input} />
  </label>
);
