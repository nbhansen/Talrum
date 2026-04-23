import type { JSX, ReactNode } from 'react';
import { useEffect, useRef } from 'react';

import styles from './Modal.module.css';

interface ModalProps {
  onClose: () => void;
  children: ReactNode;
  labelledBy?: string;
}

export const Modal = ({ onClose, children, labelledBy }: ModalProps): JSX.Element => {
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
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        {...(labelledBy ? { 'aria-labelledby': labelledBy } : {})}
      >
        {children}
      </div>
    </div>
  );
};
