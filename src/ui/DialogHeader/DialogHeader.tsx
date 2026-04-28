import type { JSX } from 'react';

import { XIcon } from '@/ui/icons';

import styles from './DialogHeader.module.css';

interface DialogHeaderProps {
  title: string;
  subtitle?: string;
  titleId: string;
  onClose: () => void;
}

export const DialogHeader = ({
  title,
  subtitle,
  titleId,
  onClose,
}: DialogHeaderProps): JSX.Element => (
  <header className={styles.header}>
    <div>
      <h2 id={titleId} className={styles.title}>
        {title}
      </h2>
      {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
    </div>
    <button type="button" onClick={onClose} aria-label="Close" className={styles.closeBtn}>
      <XIcon size={18} />
    </button>
  </header>
);
