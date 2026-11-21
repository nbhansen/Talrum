import { type JSX, type ReactNode, useState } from 'react';

import { Button } from '@/ui/Button/Button';
import { DialogHeader } from '@/ui/DialogHeader/DialogHeader';
import { TrashIcon } from '@/ui/icons';
import { Modal } from '@/ui/Modal/Modal';
import { TextField } from '@/ui/TextField/TextField';

import styles from './Sheet.module.css';

interface SheetProps {
  title: string;
  subtitle: ReactNode;
  onClose: () => void;
  children: ReactNode;
}

export const Sheet = ({ title, subtitle, onClose, children }: SheetProps): JSX.Element => (
  <Modal onClose={onClose} size="md">
    <div className={styles.headerWrap}>
      <DialogHeader title={title} subtitle={subtitle} />
    </div>
    <div className={styles.body}>{children}</div>
  </Modal>
);

interface SheetSectionProps {
  label?: string;
  className?: string | undefined;
  children: ReactNode;
}

export const SheetSection = ({ label, className, children }: SheetSectionProps): JSX.Element => (
  <section className={className ? `${styles.section} ${className}` : styles.section}>
    {label && <div className={styles.label}>{label}</div>}
    {children}
  </section>
);

export const SheetActions = ({ children }: { children: ReactNode }): JSX.Element => (
  <div className={styles.actions}>{children}</div>
);

export const SheetHint = ({ children }: { children: ReactNode }): JSX.Element => (
  <p className={styles.hint}>{children}</p>
);

interface RenameSectionProps {
  label: string;
  initial: string;
  maxLength: number;
  saveLabel: string;
  saving: boolean;
  disabled: boolean;
  onSave: (trimmed: string) => void;
}

export const RenameSection = ({
  label,
  initial,
  maxLength,
  saveLabel,
  saving,
  disabled,
  onSave,
}: RenameSectionProps): JSX.Element => {
  const [value, setValue] = useState(initial);
  const trimmed = value.trim();
  const dirty = trimmed.length > 0 && trimmed !== initial;
  return (
    <SheetSection>
      <TextField
        label={label}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={maxLength}
        disabled={disabled}
      />
      <SheetActions>
        <Button variant="primary" onClick={() => onSave(trimmed)} disabled={!dirty || disabled}>
          {saving ? 'Saving…' : saveLabel}
        </Button>
      </SheetActions>
    </SheetSection>
  );
};

interface DeleteSectionProps {
  /** Idle-state button text, e.g. "Delete pictogram". */
  label: string;
  disabled: boolean;
  onConfirm: () => void;
  children?: ReactNode;
}

/** Arming is local state, so closing the dialog discards it. */
export const DeleteSection = ({
  label,
  disabled,
  onConfirm,
  children,
}: DeleteSectionProps): JSX.Element => {
  const [confirming, setConfirming] = useState(false);
  return (
    <SheetSection label="Delete" className={styles.deleteSection}>
      {children}
      <SheetActions>
        {confirming ? (
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={disabled}>
              Cancel
            </Button>
            <Button
              variant="danger"
              icon={<TrashIcon size={14} />}
              onClick={onConfirm}
              disabled={disabled}
            >
              Delete forever
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            icon={<TrashIcon size={14} />}
            onClick={() => setConfirming(true)}
            disabled={disabled}
          >
            {label}
          </Button>
        )}
      </SheetActions>
    </SheetSection>
  );
};
