import { Fragment, type JSX, useEffect, useMemo, useRef, useState } from 'react';

import { type ParentNavKey, ParentShell } from '@/layouts/ParentShell';
import { kindUnit } from '@/lib/boardKindVocab';
import { buildBoardSteps, reorderBoardSteps } from '@/lib/boardSteps';
import {
  type SetStepIdsResult,
  useRenameBoard,
  useSetBoardKind,
  useSetKidReorderable,
  useSetLabelsVisible,
  useSetVoiceMode,
} from '@/lib/queries/boards';
import { usePictograms, usePictogramsById } from '@/lib/queries/pictograms';
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
import { SettingsRow } from './SettingsRow';
import { StepTile } from './StepTile';

const QUICK_ADD_SLUGS = ['apple', 'cup', 'shoes', 'park', 'book', 'play', 'bath', 'heart', 'store'];

const TITLE_DEBOUNCE_MS = 300;

interface BoardBuilderProps {
  board: Board;
  isOwner: boolean;
  /** Shared with the route's picker confirm, so one banner covers every step write. */
  setStepIds: SetStepIdsResult;
  onBack: () => void;
  onOpenPicker: () => void;
  onOpenShare: () => void;
  onDeleted: () => void;
  onKidMode: () => void;
  onNav?: (id: ParentNavKey) => void;
}

export const BoardBuilder = ({
  board,
  isOwner,
  setStepIds,
  onBack,
  onOpenPicker,
  onOpenShare,
  onDeleted,
  onKidMode,
  onNav,
}: BoardBuilderProps): JSX.Element => {
  const pictogramsById = usePictogramsById();
  const { data: allPictograms = [] } = usePictograms();

  const renameBoard = useRenameBoard();
  const setKind = useSetBoardKind();
  const setLabels = useSetLabelsVisible();
  const setVoice = useSetVoiceMode();
  const setKidReorderable = useSetKidReorderable();

  // Local title state keeps the input snappy; the mutation fires once the user
  // pauses typing. Re-sync only when navigating to a different board — syncing
  // on every board.name change would clobber in-progress typing when the
  // previous debounced write lands.
  const [editTarget, setEditTarget] = useState<Pictogram | null>(null);
  const [pendingKind, setPendingKind] = useState<BoardKind | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [titleDraft, setTitleDraft] = useState(board.name);
  // Re-sync the title draft only when navigating to a different board (keyed on
  // board.id, not board.name) — see the note above. The sync write is intended.
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
  useEffect(() => setTitleDraft(board.name), [board.id]);
  const pendingTitleWrite = useRef<{
    timer: ReturnType<typeof setTimeout>;
    write: () => void;
  } | null>(null);
  const queueTitleWrite = (next: string): void => {
    setTitleDraft(next);
    if (pendingTitleWrite.current) clearTimeout(pendingTitleWrite.current.timer);
    pendingTitleWrite.current = null;
    // Same rule as NewBoardModal: a blank name is never written (#480).
    const name = next.trim();
    if (name === '') return;
    const write = (): void => {
      pendingTitleWrite.current = null;
      renameBoard.mutate({ boardId: board.id, name });
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

  const quickAdd = useMemo(
    () =>
      QUICK_ADD_SLUGS.map((slug) => allPictograms.find((p) => p.slug === slug)).filter(
        (p): p is Pictogram => Boolean(p),
      ),
    [allPictograms],
  );

  const removeAt = (stepIndex: number): void =>
    setStepIds.mutate({
      boardId: board.id,
      update: (prev) => prev.filter((_, i) => i !== stepIndex),
    });

  const reorder = (nextKeys: string[]): void => {
    const { stepIds } = reorderBoardSteps(board.stepIds, steps, nextKeys);
    setStepIds.mutate({ boardId: board.id, update: () => stepIds });
  };

  const appendPicto = (pictoId: string): void =>
    setStepIds.mutate({ boardId: board.id, update: (prev) => [...prev, pictoId] });

  return (
    <ParentShell active="home" onKidMode={onKidMode} {...(onNav ? { onNav } : {})}>
      <BoardErrorBanner mutation={setStepIds} />
      <div className={styles.breadcrumb}>
        <button type="button" onClick={onBack} className={styles.back}>
          <ArrowLeftIcon size={16} />
          Boards
        </button>
        <span className={styles.crumbSep}>/</span>
        <span className={styles.crumbPath}>Editing</span>
        {isOwner && (
          <div className={styles.crumbActions}>
            <Button variant="pill" onClick={() => setConfirmingDelete(true)}>
              Delete board
            </Button>
            <Button variant="pill" onClick={onOpenShare}>
              Share
            </Button>
          </div>
        )}
      </div>
      {confirmingDelete && (
        <DeleteBoardConfirm
          boardId={board.id}
          boardName={board.name}
          onCancel={() => setConfirmingDelete(false)}
          onDeleted={onDeleted}
        />
      )}

      <input
        className={styles.titleInput}
        value={titleDraft}
        onChange={(e) => queueTitleWrite(e.target.value)}
        onBlur={restoreTitleIfBlank}
      />

      <SettingsRow
        kind={board.kind}
        onKindChange={setPendingKind}
        labelsVisible={board.labelsVisible}
        onLabelsChange={(visible) => setLabels.mutate({ boardId: board.id, visible })}
        voiceMode={board.voiceMode}
        onVoiceModeChange={(mode) => setVoice.mutate({ boardId: board.id, mode })}
        kidReorderable={board.kidReorderable}
        onKidReorderableChange={(reorderable) =>
          setKidReorderable.mutate({ boardId: board.id, reorderable })
        }
      />

      <div className={styles.track}>
        <div className={styles.trackHint}>
          {board.stepIds.length} {kindUnit(board.kind, board.stepIds.length)} · drag to reorder
        </div>
        <div className={styles.trackRow}>
          <div className={`${styles.rail} tal-scroll`}>
            <Reorderable
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
          <button type="button" className={styles.addTile} onClick={onOpenPicker}>
            <PlusIcon size={22} />
            Add picto
          </button>
        </div>
      </div>

      {quickAdd.length > 0 && (
        <section className={styles.quickAdd}>
          <div className={styles.quickAddHeader}>
            <h2 className={styles.quickAddHeading}>Quick add from library</h2>
            <button type="button" className={styles.browseAll} onClick={onOpenPicker}>
              Browse all →
            </button>
          </div>
          <div className={styles.quickAddGrid}>
            {quickAdd.map((p) => (
              <PictoTile key={p.id} picto={p} size={88} onClick={() => appendPicto(p.id)} />
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
            setKind.mutate({ boardId: board.id, kind: pendingKind });
            setPendingKind(null);
          }}
        />
      )}
    </ParentShell>
  );
};
