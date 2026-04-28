import { type JSX, useEffect, useRef, useState } from 'react';

import { type DeleteAccountError, useDeleteMyAccount } from '@/lib/queries/account';
import { DialogActions } from '@/ui/DialogActions/DialogActions';
import { DialogHeader } from '@/ui/DialogHeader/DialogHeader';
import { Modal } from '@/ui/Modal/Modal';
import { Spinner } from '@/ui/Spinner/Spinner';
import { TextField } from '@/ui/TextField/TextField';

import styles from './DeleteAccountDialog.module.css';

const REQUIRED_PHRASE = 'delete my account';
const TITLE_ID = 'del-acct-title';

interface Props {
  onCancel: () => void;
  /**
   * Forwarded to useDeleteMyAccount; fires BEFORE supabase.auth.signOut so
   * the caller can navigate to a public route while this dialog is still
   * mounted. AuthGate's onAuthStateChange listener fires synchronously
   * from inside signOut() and would otherwise unmount the dialog before
   * any post-success effect could run.
   */
  onPreSignOut: () => void;
}

const toastFor = (err: DeleteAccountError | null): string => {
  if (!err) return '';
  switch (err.code) {
    case 'unauthorized':
      return 'Your session expired. Please sign in again.';
    case 'storage_purge_failed':
      return "We couldn't delete your media files. Try again, or contact support if it keeps failing.";
    case 'auth_delete_failed':
      return "We couldn't complete the deletion. Try again, or contact support if it keeps failing.";
    default:
      return 'Something went wrong. Please contact support.';
  }
};

/**
 * Typed-phrase confirmation. Default focus is Cancel — the destructive
 * button only enables once the user types the literal phrase. Esc cancels
 * unless a deletion is already in flight (don't yank the dialog out from
 * under the user mid-mutation; let it finish and surface the error).
 *
 * Navigation is the parent's responsibility, fired through onPreSignOut
 * inside the mutation — see useDeleteMyAccount for why it must run before
 * signOut. Once that callback has navigated, AuthGate unmounts this
 * dialog as part of the route change; no post-success effect needed.
 */
export const DeleteAccountDialog = ({ onCancel, onPreSignOut }: Props): JSX.Element => {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [phrase, setPhrase] = useState('');
  const mutation = useDeleteMyAccount({ onPreSignOut });

  const matches = phrase.trim().toLowerCase() === REQUIRED_PHRASE;
  const disabled = mutation.isPending;

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  // Block close while pending so the user doesn't yank the dialog out from
  // under an in-flight mutation. Modal's Esc handler routes through here.
  const handleClose = (): void => {
    if (!mutation.isPending) onCancel();
  };

  return (
    <Modal onClose={handleClose} labelledBy={TITLE_ID}>
      <div className={styles.wrap}>
        <DialogHeader
          title="Delete your account?"
          subtitle="This is permanent and cannot be undone."
          titleId={TITLE_ID}
          onClose={handleClose}
        />
        <p className={styles.lead}>This permanently deletes:</p>
        <ul className={styles.list}>
          <li>Your account</li>
          <li>All kids you&apos;ve added</li>
          <li>All boards</li>
          <li>All pictograms (including images and recordings)</li>
          <li>All sharing relationships</li>
        </ul>
        <TextField
          label="Type 'delete my account' to confirm"
          type="text"
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          disabled={disabled}
          autoComplete="off"
        />
        {mutation.isError && (
          <div role="alert" className={styles.toast}>
            {toastFor(mutation.error)}
          </div>
        )}
        <DialogActions>
          <button
            type="button"
            ref={cancelRef}
            onClick={onCancel}
            disabled={disabled}
            className={styles.cancel}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={disabled || !matches}
            className={styles.destructive}
            aria-label="Delete forever"
          >
            {mutation.isPending && <Spinner label="Deleting" size={16} />}
            <span aria-hidden={mutation.isPending}>Delete forever</span>
          </button>
        </DialogActions>
      </div>
    </Modal>
  );
};
