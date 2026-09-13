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
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Modals nest (voice recorder inside the pictogram sheet). Every instance
    // hears the global keydown; only the last dialog in document order may
    // act, or one Escape closes the whole stack.
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      if (dialogs[dialogs.length - 1] === dialogRef.current) onClose();
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
        ref={dialogRef}
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
