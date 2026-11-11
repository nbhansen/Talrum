import type { JSX, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

import styles from './Modal.module.css';

type ModalSize = 'sm' | 'md' | 'full';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface ModalProps {
  onClose: () => void;
  children: ReactNode;
  labelledBy: string;
  size: ModalSize;
  /** Wraps the content in the standard dialog padding. */
  padded?: boolean;
}

export const Modal = ({
  onClose,
  children,
  labelledBy,
  size,
  padded = false,
}: ModalProps): JSX.Element => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  // Read in render: autoFocus moves focus at commit, before an effect runs.
  const [opener] = useState(() => document.activeElement);

  useEffect(() => {
    // Modals nest (voice recorder inside the pictogram sheet). Every instance
    // hears the global keydown; only the last dialog in document order may
    // act, or one Escape closes the whole stack.
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' && e.key !== 'Tab') return;
      const dialog = dialogRef.current;
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      if (!dialog || dialogs[dialogs.length - 1] !== dialog) return;
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      const items = dialog.querySelectorAll<HTMLElement>(FOCUSABLE);
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const outside = !dialog.contains(active) || active === dialog;
      if (!first || !last) e.preventDefault();
      else if (e.shiftKey && (outside || active === first)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (outside || active === last)) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    // A child with autoFocus already has focus; do not take it away.
    if (dialog && !dialog.contains(document.activeElement)) dialog.focus();
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [opener]);

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
        tabIndex={-1}
        aria-labelledby={labelledBy}
      >
        {padded ? <div className={styles.padded}>{children}</div> : children}
      </div>
    </div>
  );
};
