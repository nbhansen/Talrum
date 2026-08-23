import type { ButtonHTMLAttributes, JSX, ReactNode, Ref } from 'react';

import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'ghost' | 'pill' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant: ButtonVariant;
  icon?: ReactNode | undefined;
  children: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}

export const Button = ({
  variant,
  icon,
  children,
  className,
  type = 'button',
  ...rest
}: ButtonProps): JSX.Element => (
  <button
    type={type}
    className={[styles.button, styles[variant], className].filter(Boolean).join(' ')}
    {...rest}
  >
    {icon}
    {children}
  </button>
);
