import { type FormEvent, type JSX, useState } from 'react';

import { useCreateKid } from '@/lib/queries/kids';
import { Button } from '@/ui/Button/Button';
import { DialogActions } from '@/ui/DialogActions/DialogActions';
import { DialogHeader } from '@/ui/DialogHeader/DialogHeader';
import { FormError } from '@/ui/FormError/FormError';
import { Modal } from '@/ui/Modal/Modal';
import { TextField } from '@/ui/TextField/TextField';

interface NewKidModalProps {
  onClose: () => void;
}

export const NewKidModal = ({ onClose }: NewKidModalProps): JSX.Element => {
  const createKid = useCreateKid();
  const [name, setName] = useState('');

  const trimmed = name.trim();
  const submitDisabled = trimmed === '' || createKid.isPending;

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    if (submitDisabled) return;
    createKid.mutate({ name: trimmed }, { onSuccess: () => onClose() });
  };

  return (
    <Modal onClose={onClose} size="sm" padded>
      <DialogHeader
        title="New kid"
        subtitle="Each kid has their own boards. You can add more later."
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
            if (createKid.isError) createKid.reset();
          }}
          placeholder="Liam"
        />
        {createKid.isError && <FormError spaced>Couldn&apos;t add the kid. Try again.</FormError>}
        <DialogActions>
          <Button type="button" variant="ghost" onClick={onClose} disabled={createKid.isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={submitDisabled}>
            {createKid.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </form>
    </Modal>
  );
};
