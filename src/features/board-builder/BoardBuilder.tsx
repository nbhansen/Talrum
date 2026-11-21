import { Fragment, type JSX, useMemo, useState } from 'react';

import { ParentShell } from '@/layouts/ParentShell';
import { kindUnit } from '@/lib/boardKindVocab';
import { buildBoardSteps, reorderBoardSteps } from '@/lib/boardSteps';
import { type BoardFields, useUpdateBoard } from '@/lib/queries/boards';
import { usePictogramsById, usePictogramsForSlugs } from '@/lib/queries/pictograms';
import { useSearchParamFlag } from '@/lib/useSearchParamFlag';
import type { Board, BoardKind, Pictogram } from '@/types/domain';
import { Button } from '@/ui/Button/Button';
import { ArrowLeftIcon, PlusIcon, StepArrowIcon } from '@/ui/icons';
import { Reorderable } from '@/ui/Reorderable/Reorderable';
import { PictogramSheet } from '@/widgets/PictogramSheet/PictogramSheet';
import { PictoTile } from '@/widgets/PictoTile/PictoTile';

import styles from './BoardBuilder.module.css';
import { BoardErrorBanner } from './BoardErrorBanner';
import { KindSwitchConfirm } from './KindSwitchConfirm';
import { PictoPicker } from './pictogram-picker/PictoPicker';
import { RemoveBoardConfirm } from './RemoveBoardConfirm';
import { SettingsRow } from './SettingsRow';
import { ShareModal } from './ShareModal';
import { StepTile } from './StepTile';
import { useTitleDraft } from './useTitleDraft';

const QUICK_ADD_SLUGS = ['apple', 'cup', 'shoes', 'park', 'book', 'play', 'bath', 'heart', 'store'];

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
  const quickAdd = usePictogramsForSlugs(QUICK_ADD_SLUGS);
  const picker = useSearchParamFlag('picker');
  const share = useSearchParamFlag('share');

  const updateBoard = useUpdateBoard();
  const writeBoard = (update: (current: Board) => Partial<BoardFields>): void =>
    updateBoard.mutate({ boardId: board.id, update });

  const [editTarget, setEditTarget] = useState<Pictogram | null>(null);
  const [pendingKind, setPendingKind] = useState<BoardKind | null>(null);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const title = useTitleDraft(board.name, (name) => writeBoard(() => ({ name })));

  const steps = useMemo(
    () => buildBoardSteps(board.stepIds, pictogramsById),
    [board.stepIds, pictogramsById],
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
              <Button variant="pill" onClick={() => setConfirmingRemoval(true)}>
                Delete board
              </Button>
              <Button variant="pill" onClick={share.open}>
                Share
              </Button>
            </>
          ) : (
            <Button variant="pill" onClick={() => setConfirmingRemoval(true)}>
              Leave board
            </Button>
          )}
        </div>
      </div>
      {confirmingRemoval && (
        <RemoveBoardConfirm
          boardId={board.id}
          boardName={board.name}
          isOwner={isOwner}
          onCancel={() => setConfirmingRemoval(false)}
          onRemoved={onRemoved}
        />
      )}

      <input
        className={styles.titleInput}
        aria-label="Board name"
        value={title.draft}
        onChange={(e) => title.change(e.target.value)}
        onBlur={title.restoreIfBlank}
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
