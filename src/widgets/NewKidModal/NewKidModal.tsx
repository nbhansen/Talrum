import { type FormEvent, type JSX, useState } from 'react';

import { useCreateKid } from '@/lib/queries/kids';
import { Button } from '@/ui/Button/Button';
import { DialogActions } from '@/ui/DialogActions/DialogActions';
import { DialogHeader } from '@/ui/DialogHeader/DialogHeader';
import { Modal } from '@/ui/Modal/Modal';
import { TextField } from '@/ui/TextField/TextField';

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
      { name: trimmed },
      {
        onSuccess: () => onClose(),
        onError: () => setError("Couldn't add the kid. Try again."),
      },
    );
  };

  return (
    <Modal onClose={onClose} labelledBy={TITLE_ID}>
      <div className={styles.wrap}>
        <DialogHeader
          title="Add a kid"
          subtitle="Each kid has their own boards. You can add more later."
          titleId={TITLE_ID}
          onClose={onClose}
        />
        <form onSubmit={submit}>
          <TextField
            label="Name"
            type="text"
            autoFocus
            autoComplete="off"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Liam"
          />
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
          <DialogActions>
            <Button type="button" variant="ghost" onClick={onClose} disabled={createKid.isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={submitDisabled}>
              {createKid.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogActions>
        </form>
      </div>
    </Modal>
  );
};
