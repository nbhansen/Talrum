import type { JSX, ReactNode } from 'react';

import { IconButton } from '@/ui/IconButton/IconButton';
import { XIcon } from '@/ui/icons';

import styles from './DialogHeader.module.css';

interface DialogHeaderProps {
  title: string;
  subtitle?: ReactNode;
  titleId: string;
  onClose: () => void;
  closeLabel?: string;
}

export const DialogHeader = ({
  title,
  subtitle,
  titleId,
  onClose,
  closeLabel = 'Close',
}: DialogHeaderProps): JSX.Element => (
  <header className={styles.header}>
    <div>
      <h2 id={titleId} className={styles.title}>
        {title}
      </h2>
      {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
    </div>
    <IconButton onClick={onClose} aria-label={closeLabel}>
      <XIcon size={18} />
    </IconButton>
  </header>
);
