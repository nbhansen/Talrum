import { type FormEvent, type JSX, useState } from 'react';

import { useSessionUser } from '@/lib/auth/session';
import {
  isAlreadyMemberError,
  isShareForbiddenError,
  useAddBoardMember,
  useBoardMembers,
  useRemoveBoardMember,
} from '@/lib/queries/board-members';
import { XIcon } from '@/ui/icons';
import { Modal } from '@/ui/Modal/Modal';

import styles from './ShareModal.module.css';

const TITLE_ID = 'share-modal-title';

// RFC 4122 v4 / v7 / generic UUID surface check. Supabase uses gen_random_uuid()
// which emits v4; browser-pasted IDs from a sibling user will look the same.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ShareModalProps {
  boardId: string;
  isOwner: boolean;
  onClose: () => void;
}

interface CopyState {
  copied: boolean;
  error: string | null;
  copy: (text: string) => void;
}

const useCopy = (): CopyState => {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copy = (text: string): void => {
    // Insecure context (http://) blocks clipboard API in Chrome/Safari; the
    // call would reject with an unhelpful DOMException. Short-circuit and
    // surface the same fallback copy.
    if (
      typeof navigator === 'undefined' ||
      !navigator.clipboard ||
      (typeof window !== 'undefined' && window.isSecureContext === false)
    ) {
      setError("Couldn't copy — select the ID and copy manually.");
      return;
    }
    setError(null);
    void navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {
        setError("Couldn't copy — select the ID and copy manually.");
      },
    );
  };
  return { copied, error, copy };
};

export const ShareModal = ({ boardId, isOwner, onClose }: ShareModalProps): JSX.Element => {
  const me = useSessionUser();
  const members = useBoardMembers(boardId);
  const addMember = useAddBoardMember();
  const removeMember = useRemoveBoardMember();
  const { copied, error: copyError, copy } = useCopy();

  const [draftId, setDraftId] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const submitting = addMember.isPending;

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    const trimmed = draftId.trim().toLowerCase();
    if (!UUID_RE.test(trimmed)) {
      setSubmitError("That doesn't look like a valid sharing ID.");
      return;
    }
    if (trimmed === me.id) {
      setSubmitError("That's your own sharing ID.");
      return;
    }
    setSubmitError(null);
    addMember.mutate(
      { boardId, userId: trimmed, role: 'viewer' },
      {
        onSuccess: () => {
          setDraftId('');
        },
        onError: (err) => {
          if (isAlreadyMemberError(err)) {
            setSubmitError('That person already has access to this board.');
            return;
          }
          if (isShareForbiddenError(err)) {
            setSubmitError("You can't share this board.");
            return;
          }
          setSubmitError("Couldn't add that person. Try again.");
        },
      },
    );
  };

  return (
    <Modal onClose={onClose} labelledBy={TITLE_ID}>
      <div className={styles.wrap}>
        <header className={styles.header}>
          <div>
            <h2 id={TITLE_ID} className={styles.title}>
              Share this board
            </h2>
            <p className={styles.subtitle}>
              People you share with see this board on their own iPad. They can't make changes.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className={styles.closeBtn}>
            <XIcon size={18} />
          </button>
        </header>

        <section className={styles.section}>
          <span className={styles.sectionLabel}>Your sharing ID</span>
          <div className={styles.idRow}>
            <div className={styles.idValue}>{me.id}</div>
            <button
              type="button"
              onClick={() => copy(me.id)}
              className={styles.copyBtn}
              aria-label="Copy your sharing ID"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          {copyError && (
            <p role="alert" className={styles.error}>
              {copyError}
            </p>
          )}
        </section>

        {isOwner && (
          <>
            <section className={styles.section}>
              <span className={styles.sectionLabel}>Shared with</span>
              {members.isPending ? (
                // Distinct from the empty state so an owner who's already
                // shared with someone doesn't see "No one yet." flash before
                // the first fetch lands.
                <p className={styles.empty} role="status" aria-live="polite">
                  Loading…
                </p>
              ) : members.data && members.data.length > 0 ? (
                <ul className={styles.memberList}>
                  {members.data.map((m) => (
                    <li key={m.userId} className={styles.memberRow}>
                      <span className={styles.memberId}>{m.userId}</span>
                      <span className={styles.memberRole}>{m.role}</span>
                      <button
                        type="button"
                        onClick={() => removeMember.mutate({ boardId, userId: m.userId })}
                        aria-label={`Remove ${m.userId}`}
                        className={styles.removeBtn}
                        disabled={removeMember.isPending}
                      >
                        <XIcon size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.empty}>No one yet.</p>
              )}
            </section>

            <section className={styles.section}>
              <span className={styles.sectionLabel}>Add someone</span>
              <form className={styles.addRow} onSubmit={submit}>
                <input
                  type="text"
                  className={styles.input}
                  placeholder="Paste a sharing ID"
                  autoComplete="off"
                  value={draftId}
                  onChange={(e) => {
                    setDraftId(e.target.value);
                    if (submitError) setSubmitError(null);
                  }}
                  aria-label="Sharing ID"
                />
                <button
                  type="submit"
                  className={styles.copyBtn}
                  disabled={submitting || draftId.trim() === ''}
                >
                  {submitting ? 'Adding…' : 'Add'}
                </button>
              </form>
              {submitError && (
                <p role="alert" className={styles.error}>
                  {submitError}
                </p>
              )}
            </section>
          </>
        )}
      </div>
    </Modal>
  );
};
