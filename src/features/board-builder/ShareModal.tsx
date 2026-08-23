import { type JSX } from 'react';

import { useSessionUser } from '@/lib/auth/session';
import { useBoardMembers, useRemoveBoardMember } from '@/lib/queries/board-members';
import { useCopy } from '@/lib/useCopy';
import { Button } from '@/ui/Button/Button';
import { DialogHeader } from '@/ui/DialogHeader/DialogHeader';
import { IconButton } from '@/ui/IconButton/IconButton';
import { XIcon } from '@/ui/icons';
import { Modal } from '@/ui/Modal/Modal';

import styles from './ShareModal.module.css';
import { useShareSubmit } from './useShareSubmit';

const TITLE_ID = 'share-modal-title';

interface ShareModalProps {
  boardId: string;
  isOwner: boolean;
  onClose: () => void;
}

export const ShareModal = ({ boardId, isOwner, onClose }: ShareModalProps): JSX.Element => {
  const me = useSessionUser();
  const members = useBoardMembers(boardId);
  const removeMember = useRemoveBoardMember();
  const { copied, error: copyError, copy } = useCopy();
  const { draftId, setDraftId, submit, submitError, submitting } = useShareSubmit({
    boardId,
    meId: me.id,
  });

  return (
    <Modal onClose={onClose} labelledBy={TITLE_ID} size="md">
      <div className={styles.wrap}>
        <DialogHeader
          title="Share this board"
          subtitle={
            isOwner
              ? 'People you share with see this board on their own iPad and can change it like you. Only you can share or delete it.'
              : 'This board is shared with you. You can change it; only its owner can share or delete it.'
          }
          titleId={TITLE_ID}
          onClose={onClose}
        />
        <section className={styles.section}>
          <span className={styles.sectionLabel}>Your sharing ID</span>
          <div className={styles.idRow}>
            <div className={styles.idValue}>{me.id}</div>
            <Button variant="pill" onClick={() => copy(me.id)} aria-label="Copy your sharing ID">
              {copied ? 'Copied' : 'Copy'}
            </Button>
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
                      <IconButton
                        size="sm"
                        onClick={() => removeMember.mutate({ boardId, userId: m.userId })}
                        aria-label={`Remove ${m.userId}`}
                        disabled={removeMember.isPending}
                      >
                        <XIcon size={14} />
                      </IconButton>
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
                  onChange={(e) => setDraftId(e.target.value)}
                  aria-label="Sharing ID"
                />
                <Button variant="pill" type="submit" disabled={submitting || draftId.trim() === ''}>
                  {submitting ? 'Adding…' : 'Add'}
                </Button>
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
