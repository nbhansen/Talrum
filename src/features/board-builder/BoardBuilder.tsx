import { Fragment, type JSX, useEffect, useMemo, useRef, useState } from 'react';

import { ParentShell } from '@/layouts/ParentShell';
import { kindUnit } from '@/lib/boardKindVocab';
import { buildBoardSteps, reorderBoardSteps } from '@/lib/boardSteps';
import { type BoardFields, useUpdateBoard } from '@/lib/queries/boards';
import { usePictogramsById, usePictogramsBySlug } from '@/lib/queries/pictograms';
import { useSearchParamFlag } from '@/lib/useSearchParamFlag';
import type { Board, BoardKind, Pictogram } from '@/types/domain';
import { Button } from '@/ui/Button/Button';
import { ArrowLeftIcon, PlusIcon, StepArrowIcon } from '@/ui/icons';
import { Reorderable } from '@/ui/Reorderable/Reorderable';
import { PictogramSheet } from '@/widgets/PictogramSheet/PictogramSheet';
import { PictoTile } from '@/widgets/PictoTile/PictoTile';

import styles from './BoardBuilder.module.css';
import { BoardErrorBanner } from './BoardErrorBanner';
import { DeleteBoardConfirm } from './DeleteBoardConfirm';
import { KindSwitchConfirm } from './KindSwitchConfirm';
import { LeaveBoardConfirm } from './LeaveBoardConfirm';
import { PictoPicker } from './pictogram-picker/PictoPicker';
import { SettingsRow } from './SettingsRow';
import { ShareModal } from './ShareModal';
import { StepTile } from './StepTile';

const QUICK_ADD_SLUGS = ['apple', 'cup', 'shoes', 'park', 'book', 'play', 'bath', 'heart', 'store'];

const TITLE_DEBOUNCE_MS = 300;

interface BoardBuilderProps {
  board: Board;
  isOwner: boolean;
  onBack: () => void;
  /** After the board is deleted or left. */
  onRemoved: () => void;
  onKidMode: () => void;
}

export const BoardBuilder = ({
  board,
  isOwner,
  onBack,
  onRemoved,
  onKidMode,
}: BoardBuilderProps): JSX.Element => {
  const pictogramsById = usePictogramsById();
  const pictogramsBySlug = usePictogramsBySlug();
  const picker = useSearchParamFlag('picker');
  const share = useSearchParamFlag('share');

  const updateBoard = useUpdateBoard();
  const writeBoard = (update: (current: Board) => Partial<BoardFields>): void =>
    updateBoard.mutate({ boardId: board.id, update });

  const [editTarget, setEditTarget] = useState<Pictogram | null>(null);
  const [pendingKind, setPendingKind] = useState<BoardKind | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [titleDraft, setTitleDraft] = useState(board.name);
  const pendingTitleWrite = useRef<{
    timer: ReturnType<typeof setTimeout>;
    write: () => void;
  } | null>(null);
  // A refetch can bring a newer name (#766). While a rename waits, the
  // user's typing wins: their write will replace the server name anyway.
  useEffect(() => {
    if (!pendingTitleWrite.current) setTitleDraft(board.name);
  }, [board.name]);
  const queueTitleWrite = (next: string): void => {
    setTitleDraft(next);
    if (pendingTitleWrite.current) clearTimeout(pendingTitleWrite.current.timer);
    pendingTitleWrite.current = null;
    // Same rule as NewBoardModal: a blank name is never written (#480).
    const name = next.trim();
    if (name === '') return;
    const write = (): void => {
      pendingTitleWrite.current = null;
      writeBoard(() => ({ name }));
    };
    pendingTitleWrite.current = { timer: setTimeout(write, TITLE_DEBOUNCE_MS), write };
  };
  const restoreTitleIfBlank = (): void => {
    if (titleDraft.trim() === '') setTitleDraft(board.name);
  };
  // Flush, not cancel: a back tap inside the debounce window dropped the last
  // edit (#444).
  useEffect(
    () => () => {
      if (!pendingTitleWrite.current) return;
      clearTimeout(pendingTitleWrite.current.timer);
      pendingTitleWrite.current.write();
    },
    [],
  );

  const steps = useMemo(
    () => buildBoardSteps(board.stepIds, pictogramsById),
    [board.stepIds, pictogramsById],
  );

  const quickAdd = QUICK_ADD_SLUGS.map((slug) => pictogramsBySlug.get(slug)).filter(
    (p): p is Pictogram => Boolean(p),
  );

  const removeAt = (stepIndex: number): void =>
    writeBoard((b) => ({ stepIds: b.stepIds.filter((_, i) => i !== stepIndex) }));

  const reorder = (nextKeys: string[]): void => {
    const { stepIds } = reorderBoardSteps(board.stepIds, steps, nextKeys);
    writeBoard(() => ({ stepIds }));
  };

  const appendPictos = (ids: readonly string[]): void => {
    if (ids.length > 0) writeBoard((b) => ({ stepIds: [...b.stepIds, ...ids] }));
  };

  const retryWrite = (): void => {
    if (updateBoard.variables) updateBoard.mutate(updateBoard.variables);
  };

  return (
    <ParentShell active="home" onKidMode={onKidMode}>
      {updateBoard.isError && (
        <BoardErrorBanner onRetry={retryWrite} onDismiss={() => updateBoard.reset()} />
      )}
      <div className={styles.breadcrumb}>
        <button type="button" onClick={onBack} className={styles.back}>
          <ArrowLeftIcon size={16} />
          Boards
        </button>
        <span className={styles.crumbSep}>/</span>
        <span className={styles.crumbPath}>Editing</span>
        <div className={styles.crumbActions}>
          {isOwner ? (
            <>
              <Button variant="pill" onClick={() => setConfirmingDelete(true)}>
                Delete board
              </Button>
              <Button variant="pill" onClick={share.open}>
                Share
              </Button>
            </>
          ) : (
            <Button variant="pill" onClick={() => setConfirmingLeave(true)}>
              Leave board
            </Button>
          )}
        </div>
      </div>
      {confirmingDelete && (
        <DeleteBoardConfirm
          boardId={board.id}
          boardName={board.name}
          onCancel={() => setConfirmingDelete(false)}
          onDeleted={onRemoved}
        />
      )}
      {confirmingLeave && (
        <LeaveBoardConfirm
          boardId={board.id}
          boardName={board.name}
          onCancel={() => setConfirmingLeave(false)}
          onLeft={onRemoved}
        />
      )}

      <input
        className={styles.titleInput}
        aria-label="Board name"
        value={titleDraft}
        onChange={(e) => queueTitleWrite(e.target.value)}
        onBlur={restoreTitleIfBlank}
      />

      <SettingsRow
        kind={board.kind}
        onKindChange={setPendingKind}
        labelsVisible={board.labelsVisible}
        onLabelsChange={(labelsVisible) => writeBoard(() => ({ labelsVisible }))}
        voiceMode={board.voiceMode}
        onVoiceModeChange={(voiceMode) => writeBoard(() => ({ voiceMode }))}
        kidReorderable={board.kidReorderable}
        onKidReorderableChange={(kidReorderable) => writeBoard(() => ({ kidReorderable }))}
      />

      <div className={styles.track}>
        <div className={styles.trackHint}>
          {board.stepIds.length} {kindUnit(board.kind, board.stepIds.length)} · drag to reorder
        </div>
        <div className={styles.trackRow}>
          <div className={`${styles.rail} tal-scroll`}>
            <Reorderable
              handle
              items={steps}
              onReorder={reorder}
              renderItem={(step, i, drag) => (
                <Fragment key={step.id}>
                  <StepTile
                    picto={step.picto}
                    index={i}
                    kind={board.kind}
                    labelsVisible={board.labelsVisible}
                    onRemove={() => removeAt(step.stepIndex)}
                    onEdit={() => setEditTarget(step.picto)}
                    drag={drag}
                  />
                  {i < steps.length - 1 && (
                    <div className={styles.connector}>
                      {board.kind === 'sequence' ? (
                        <StepArrowIcon size={22} />
                      ) : (
                        <span className={styles.orPill}>OR</span>
                      )}
                    </div>
                  )}
                </Fragment>
              )}
            />
          </div>
          <button type="button" className={styles.addTile} onClick={picker.open}>
            <PlusIcon size={22} />
            Add picto
          </button>
        </div>
      </div>

      {quickAdd.length > 0 && (
        <section className={styles.quickAdd}>
          <div className={styles.quickAddHeader}>
            <h2 className={styles.quickAddHeading}>Add from the library</h2>
            <button type="button" className={styles.browseAll} onClick={picker.open}>
              Browse all →
            </button>
          </div>
          <div className={styles.quickAddGrid}>
            {quickAdd.map((p) => (
              <PictoTile key={p.id} picto={p} size={88} onClick={() => appendPictos([p.id])} />
            ))}
          </div>
        </section>
      )}
      {editTarget && <PictogramSheet picto={editTarget} onClose={() => setEditTarget(null)} />}
      {pendingKind && (
        <KindSwitchConfirm
          current={board.kind}
          next={pendingKind}
          onCancel={() => setPendingKind(null)}
          onConfirm={() => {
            writeBoard(() => ({ kind: pendingKind }));
            setPendingKind(null);
          }}
        />
      )}
      {picker.isOpen && (
        <PictoPicker ownerId={board.ownerId} onClose={picker.close} onConfirm={appendPictos} />
      )}
      {share.isOpen && <ShareModal boardId={board.id} isOwner={isOwner} onClose={share.close} />}
    </ParentShell>
  );
};
