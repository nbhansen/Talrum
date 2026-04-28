import { forwardRef, type InputHTMLAttributes } from 'react';

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
