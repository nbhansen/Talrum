import { type JSX, useEffect, useId, useRef, useState } from 'react';

import { type DeleteAccountError, useDeleteMyAccount } from '@/lib/queries/account';

import styles from './DeleteAccountDialog.module.css';

const REQUIRED_PHRASE = 'delete my account';

interface Props {
  onSuccess: () => void;
  onCancel: () => void;
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
 * Navigation is the parent's responsibility: when the mutation succeeds
 * this calls onSuccess() and the parent (DeleteAccountSection) routes to
 * /account-deleted with replace:true.
 */
export const DeleteAccountDialog = ({ onSuccess, onCancel }: Props): JSX.Element => {
  const inputId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [phrase, setPhrase] = useState('');
  const mutation = useDeleteMyAccount();

  const matches = phrase.trim().toLowerCase() === REQUIRED_PHRASE;
  const disabled = mutation.isPending;

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    if (mutation.isSuccess) onSuccess();
  }, [mutation.isSuccess, onSuccess]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !mutation.isPending) onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel, mutation.isPending]);

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="del-acct-title" className={styles.dialog}>
      <h2 id="del-acct-title">Delete your account?</h2>
      <p>This permanently deletes:</p>
      <ul>
        <li>Your account</li>
        <li>All kids you&apos;ve added</li>
        <li>All boards</li>
        <li>All pictograms (including images and recordings)</li>
        <li>All sharing relationships</li>
      </ul>
      <p>
        <strong>This cannot be undone.</strong>
      </p>
      <label htmlFor={inputId}>
        Type <em>delete my account</em> to confirm.
      </label>
      <input
        id={inputId}
        type="text"
        value={phrase}
        onChange={(e) => setPhrase(e.target.value)}
        disabled={disabled}
        autoComplete="off"
        className={styles.input}
      />
      {mutation.isError && (
        <div role="alert" className={styles.toast}>
          {toastFor(mutation.error)}
        </div>
      )}
      <div className={styles.actions}>
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
          {mutation.isPending && (
            <span role="progressbar" aria-label="Deleting" className={styles.spinner} />
          )}
          <span aria-hidden={mutation.isPending}>Delete forever</span>
        </button>
      </div>
    </div>
  );
};
