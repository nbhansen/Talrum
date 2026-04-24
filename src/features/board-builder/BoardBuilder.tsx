import { Fragment, type JSX, useMemo } from 'react';

import { ParentShell } from '@/layouts/ParentShell';
import { usePictograms, usePictogramsById } from '@/lib/queries/pictograms';
import type { Board, BoardKind, Pictogram } from '@/types/domain';
import { Button } from '@/ui/Button/Button';
import { ArrowLeftIcon, PlayIcon, PlusIcon, StepArrowIcon } from '@/ui/icons';
import { PictoTile } from '@/ui/PictoTile/PictoTile';

import styles from './BoardBuilder.module.css';
import {
  useRenameBoard,
  useSetBoardKind,
  useSetLabelsVisible,
  useSetStepIds,
  useSetVoiceMode,
} from './mutations';
import { SettingsRow } from './SettingsRow';
import { StepTile } from './StepTile';
import { Reorderable } from './useReorderable';

const QUICK_ADD_IDS = ['apple', 'cup', 'shoes', 'park', 'book', 'play', 'bath', 'heart', 'store'];

interface BoardBuilderProps {
  board: Board;
  onBack: () => void;
  onOpenPicker: () => void;
  onPreview: (kind: BoardKind) => void;
}

interface Step {
  key: string;
  pictoId: string;
  picto: Pictogram;
}

/**
 * React keys must be unique across duplicates of the same pictogram. The
 * `pictoId` alone collides when a board contains the same pictogram twice.
 * A positional suffix keeps each rendered step stable during reorder.
 */
const buildSteps = (stepIds: string[], byId: Map<string, Pictogram>): Step[] =>
  stepIds.flatMap((pictoId, index) => {
    const picto = byId.get(pictoId);
    if (!picto) return [];
    return [{ key: `${pictoId}-${index}`, pictoId, picto }];
  });

export const BoardBuilder = ({
  board,
  onBack,
  onOpenPicker,
  onPreview,
}: BoardBuilderProps): JSX.Element => {
  const pictogramsById = usePictogramsById();
  const { data: allPictograms = [] } = usePictograms();

  const renameBoard = useRenameBoard();
  const setKind = useSetBoardKind();
  const setLabels = useSetLabelsVisible();
  const setVoice = useSetVoiceMode();
  const setStepIds = useSetStepIds();

  const steps = useMemo(
    () => buildSteps(board.stepIds, pictogramsById),
    [board.stepIds, pictogramsById],
  );

  const quickAdd = useMemo(
    () => QUICK_ADD_IDS.map((id) => allPictograms.find((p) => p.id === id)).filter(
        (p): p is Pictogram => Boolean(p),
      ),
    [allPictograms],
  );

  const removeAt = (index: number): void =>
    setStepIds.mutate({
      boardId: board.id,
      stepIds: board.stepIds.filter((_, i) => i !== index),
    });

  const reorder = (nextKeys: string[]): void => {
    const byKey = new Map(steps.map((s) => [s.key, s.pictoId]));
    const nextIds = nextKeys
      .map((k) => byKey.get(k))
      .filter((id): id is string => typeof id === 'string');
    setStepIds.mutate({ boardId: board.id, stepIds: nextIds });
  };

  const appendPicto = (pictoId: string): void =>
    setStepIds.mutate({ boardId: board.id, stepIds: [...board.stepIds, pictoId] });

  return (
    <ParentShell
      active="home"
      right={
        <Button variant="primary" icon={<PlayIcon />} onClick={() => onPreview(board.kind)}>
          Preview for Liam
        </Button>
      }
    >
      <div className={styles.breadcrumb}>
        <button type="button" onClick={onBack} className={styles.back}>
          <ArrowLeftIcon size={16} />
          Boards
        </button>
        <span className={styles.crumbSep}>/</span>
        <span className={styles.crumbPath}>Editing</span>
      </div>

      <input
        className={styles.titleInput}
        value={board.name}
        onChange={(e) => renameBoard.mutate({ boardId: board.id, name: e.target.value })}
      />

      <SettingsRow
        kind={board.kind}
        onKindChange={(kind) => setKind.mutate({ boardId: board.id, kind })}
        labelsVisible={board.labelsVisible}
        onLabelsChange={(visible) => setLabels.mutate({ boardId: board.id, visible })}
        voiceMode={board.voiceMode}
        onVoiceModeChange={(mode) => setVoice.mutate({ boardId: board.id, mode })}
        stepCount={board.stepIds.length}
      />

      <div className={styles.track}>
        <div className={`${styles.rail} tal-scroll`}>
          <Reorderable
            items={steps.map((s) => ({ ...s, id: s.key }))}
            onReorder={reorder}
            renderItem={(step, i, drag) => (
              <Fragment key={step.id}>
                <StepTile
                  picto={step.picto}
                  index={i}
                  kind={board.kind}
                  labelsVisible={board.labelsVisible}
                  onRemove={() => removeAt(i)}
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
          <button type="button" className={styles.addTile} onClick={onOpenPicker}>
            <PlusIcon size={22} />
            Add picto
          </button>
        </div>
      </div>

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
    </ParentShell>
  );
};
