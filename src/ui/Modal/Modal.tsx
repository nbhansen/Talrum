import type { JSX, ReactNode } from 'react';
import { useEffect, useRef } from 'react';

import styles from './Modal.module.css';

export type ModalSize = 'sm' | 'md' | 'full';

interface ModalProps {
  onClose: () => void;
  children: ReactNode;
  labelledBy?: string;
  size: ModalSize;
}

export const Modal = ({ onClose, children, labelledBy, size }: ModalProps): JSX.Element => {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      ref={overlayRef}
      className={styles.overlay}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div
        className={`${styles.dialog} ${styles[size]}`}
        role="dialog"
        aria-modal="true"
        {...(labelledBy ? { 'aria-labelledby': labelledBy } : {})}
      >
        {children}
      </div>
    </div>
  );
};
