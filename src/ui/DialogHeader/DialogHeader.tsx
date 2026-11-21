import type { JSX, ReactNode } from 'react';

import { IconButton } from '@/ui/IconButton/IconButton';
import { XIcon } from '@/ui/icons';
import { useModalHeader } from '@/ui/Modal/modalContext';

import styles from './DialogHeader.module.css';

interface DialogHeaderProps {
  title: string;
  subtitle?: ReactNode;
  closeLabel?: string;
}

export const DialogHeader = ({
  title,
  subtitle,
  closeLabel = 'Close',
}: DialogHeaderProps): JSX.Element => {
  const { titleId, onClose } = useModalHeader();
  return (
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
};
