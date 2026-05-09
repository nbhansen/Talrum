import { type JSX, useState } from 'react';

import { useBoards } from '@/lib/queries/boards';
import {
  setActiveKidId,
  useActiveKid,
  useDeleteKid,
  useKids,
  useRenameKid,
} from '@/lib/queries/kids';
import type { Kid } from '@/types/domain';
import { Button } from '@/ui/Button/Button';
import { CheckIcon, TrashIcon, XIcon } from '@/ui/icons';
import { Modal } from '@/ui/Modal/Modal';

import styles from './KidSheet.module.css';

interface Props {
  kid: Kid;
  onClose: () => void;
}

const TITLE_ID = 'tal-kid-sheet-title';
const NAME_MAX = 40;

export const KidSheet = ({ kid, onClose }: Props): JSX.Element => {
  const [name, setName] = useState(kid.name);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const renameMut = useRenameKid();
  const deleteMut = useDeleteKid();
  const { data: kids = [] } = useKids();
  const { data: boards } = useBoards();
  const activeKid = useActiveKid();

  const isLastKid = kids.length <= 1;
  const isActive = activeKid?.id === kid.id;
  const boardCount = (boards ?? []).filter((b) => b.kidId === kid.id).length;

  const trimmedName = name.trim();
  const nameDirty = trimmedName.length > 0 && trimmedName !== kid.name;
  const saving = renameMut.isPending || deleteMut.isPending;

  const onSaveName = async (): Promise<void> => {
    if (!nameDirty) return;
    setError(null);
    try {
      await renameMut.mutateAsync({ kidId: kid.id, name: trimmedName });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rename failed.');
    }
  };

  const onSetActive = (): void => {
    setActiveKidId(kid.id);
    onClose();
  };

  const onDelete = async (): Promise<void> => {
    setError(null);
    try {
      await deleteMut.mutateAsync({ kidId: kid.id });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.');
    }
  };

  return (
    <Modal onClose={onClose} labelledBy={TITLE_ID}>
      <header className={styles.header}>
        <div>
          <h2 id={TITLE_ID} className={styles.title}>
            Edit kid
          </h2>
          <p className={styles.subtitle}>
            Rename, set active, or delete <strong>{kid.name}</strong>.
          </p>
        </div>
        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
          <XIcon size={16} />
        </button>
      </header>

      <div className={styles.body}>
        <section className={styles.section}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Name</span>
            <input
              className={styles.input}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={NAME_MAX}
              disabled={saving}
            />
          </label>
          <div className={styles.sectionActions}>
            <Button
              variant="primary"
              onClick={() => {
                void onSaveName();
              }}
              disabled={!nameDirty || saving}
            >
              {renameMut.isPending ? 'Saving…' : 'Save name'}
            </Button>
          </div>
        </section>

        {!isLastKid && (
          <section className={styles.section}>
            <div className={styles.fieldLabel}>Active kid</div>
            {isActive ? (
              <p className={styles.dangerHint}>
                <strong>{kid.name}</strong> is the active kid. Parent home shows their boards.
              </p>
            ) : (
              <>
                <p className={styles.dangerHint}>Parent home filters boards by active kid.</p>
                <div className={styles.sectionActions}>
                  <Button
                    variant="ghost"
                    icon={<CheckIcon size={14} />}
                    onClick={onSetActive}
                    disabled={saving}
                  >
                    Set as active
                  </Button>
                </div>
              </>
            )}
          </section>
        )}

        <section className={styles.dangerSection}>
          <div className={styles.fieldLabel}>Delete</div>
          {isLastKid ? (
            <p className={styles.dangerHint}>You need at least one kid.</p>
          ) : (
            boardCount > 0 && (
              <p className={styles.dangerHint}>
                Also deletes {boardCount} board{boardCount === 1 ? '' : 's'} for this kid.
              </p>
            )
          )}
          <div className={styles.sectionActions}>
            {confirmDelete ? (
              <>
                <Button variant="ghost" onClick={() => setConfirmDelete(false)} disabled={saving}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  className={styles.dangerBtn}
                  icon={<TrashIcon size={14} />}
                  onClick={() => {
                    void onDelete();
                  }}
                  disabled={saving}
                >
                  Delete forever
                </Button>
              </>
            ) : (
              <Button
                variant="ghost"
                icon={<TrashIcon size={14} />}
                onClick={() => setConfirmDelete(true)}
                disabled={saving || isLastKid}
              >
                Delete kid
              </Button>
            )}
          </div>
        </section>

        {error && <div className={styles.error}>{error}</div>}
      </div>
    </Modal>
  );
};
