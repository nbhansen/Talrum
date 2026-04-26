import { type FormEvent, type JSX, useState } from 'react';

import { useCreateKid } from '@/lib/queries/kids';
import { Button } from '@/ui/Button/Button';
import { XIcon } from '@/ui/icons';
import { Modal } from '@/ui/Modal/Modal';

import styles from './NewKidModal.module.css';

const TITLE_ID = 'new-kid-modal-title';

interface NewKidModalProps {
  onClose: () => void;
}

export const NewKidModal = ({ onClose }: NewKidModalProps): JSX.Element => {
  const createKid = useCreateKid();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();
  const submitDisabled = trimmed === '' || createKid.isPending;

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    if (submitDisabled) return;
    setError(null);
    createKid.mutate(
      { name },
      {
        onSuccess: () => onClose(),
        onError: () => setError("Couldn't add the kid. Try again."),
      },
    );
  };

  return (
    <Modal onClose={onClose} labelledBy={TITLE_ID}>
      <div className={styles.wrap}>
        <header className={styles.header}>
          <div>
            <h2 id={TITLE_ID} className={styles.title}>
              Add a kid
            </h2>
            <p className={styles.subtitle}>
              Each kid has their own boards. You can add more later.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className={styles.closeBtn}>
            <XIcon size={18} />
          </button>
        </header>

        <form onSubmit={submit}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Name</span>
            <input
              type="text"
              autoFocus
              autoComplete="off"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              className={styles.input}
              placeholder="Liam"
            />
          </label>
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
          <div className={styles.actions}>
            <Button type="button" variant="ghost" onClick={onClose} disabled={createKid.isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={submitDisabled}>
              {createKid.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
};
