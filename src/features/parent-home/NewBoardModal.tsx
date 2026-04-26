import { type FormEvent, type JSX, useState } from 'react';

import { useCreateBoard } from '@/lib/queries/boards';
import { useKids } from '@/lib/queries/kids';
import type { BoardKind } from '@/types/domain';
import { Button } from '@/ui/Button/Button';
import { XIcon } from '@/ui/icons';
import { Modal } from '@/ui/Modal/Modal';

import styles from './NewBoardModal.module.css';

const TITLE_ID = 'new-board-modal-title';

interface NewBoardModalProps {
  onClose: () => void;
  onCreated: (boardId: string) => void;
}

const KIND_OPTIONS: readonly { value: BoardKind; label: string; hint: string }[] = [
  { value: 'sequence', label: 'Sequence', hint: 'Step-by-step strip' },
  { value: 'choice', label: 'Choice', hint: '3-up picker' },
];

export const NewBoardModal = ({ onClose, onCreated }: NewBoardModalProps): JSX.Element => {
  const kids = useKids();
  const createBoard = useCreateBoard();

  const kidList = kids.data ?? [];
  const [name, setName] = useState('');
  const [kind, setKind] = useState<BoardKind>('sequence');
  const [selectedKidId, setSelectedKidId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Pick the first kid as default once the list resolves. Re-running this
  // effect when the user picks one explicitly is unnecessary — local state
  // wins after the first user interaction.
  const effectiveKidId = selectedKidId || kidList[0]?.id || '';

  const trimmed = name.trim();
  const noKids = kidList.length === 0;
  const submitDisabled = trimmed === '' || noKids || createBoard.isPending;

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    if (submitDisabled) return;
    setError(null);
    createBoard.mutate(
      { name: trimmed, kind, kidId: effectiveKidId },
      {
        onSuccess: (board) => {
          onCreated(board.id);
          onClose();
        },
        onError: () => setError("Couldn't create the board. Try again."),
      },
    );
  };

  return (
    <Modal onClose={onClose} labelledBy={TITLE_ID}>
      <div className={styles.wrap}>
        <header className={styles.header}>
          <div>
            <h2 id={TITLE_ID} className={styles.title}>
              New board
            </h2>
            <p className={styles.subtitle}>
              You can add steps and tweak settings after the board is created.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className={styles.closeBtn}>
            <XIcon size={18} />
          </button>
        </header>

        <form onSubmit={submit}>
          {noKids && (
            <p className={styles.noKids} role="status">
              Add a kid first — boards need a kid to belong to.
            </p>
          )}

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
              placeholder="Morning routine"
              disabled={noKids}
            />
          </label>

          <fieldset className={`${styles.field} ${styles.kindGroup}`}>
            {KIND_OPTIONS.map((opt) => {
              const checked = kind === opt.value;
              return (
                <label
                  key={opt.value}
                  className={`${styles.kindOption} ${checked ? styles.kindOptionChecked : ''}`}
                >
                  <input
                    type="radio"
                    name="kind"
                    value={opt.value}
                    checked={checked}
                    onChange={() => setKind(opt.value)}
                    className={styles.kindRadio}
                    disabled={noKids}
                  />
                  <span>{opt.label}</span>
                </label>
              );
            })}
          </fieldset>

          {kidList.length > 1 && (
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Kid</span>
              <select
                value={effectiveKidId}
                onChange={(e) => setSelectedKidId(e.target.value)}
                className={styles.input}
              >
                {kidList.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}

          <div className={styles.actions}>
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={createBoard.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={submitDisabled}>
              {createBoard.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
};
