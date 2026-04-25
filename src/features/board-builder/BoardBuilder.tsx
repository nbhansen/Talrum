import { Fragment, type JSX, useEffect, useMemo, useRef, useState } from 'react';

import { ParentShell } from '@/layouts/ParentShell';
import { Reorderable } from '@/ui/Reorderable/Reorderable';
import {
  useRenameBoard,
  useSetBoardKind,
  useSetKidReorderable,
  useSetLabelsVisible,
  useSetStepIds,
  useSetVoiceMode,
} from '@/lib/queries/boards';
import { usePictograms, usePictogramsById } from '@/lib/queries/pictograms';
import type { Board, BoardKind, Pictogram } from '@/types/domain';
import { Button } from '@/ui/Button/Button';
import { ArrowLeftIcon, PlayIcon, PlusIcon, StepArrowIcon } from '@/ui/icons';
import { PictoTile } from '@/ui/PictoTile/PictoTile';

import styles from './BoardBuilder.module.css';
import { SettingsRow } from './SettingsRow';
import { StepTile } from './StepTile';

const QUICK_ADD_SLUGS = ['apple', 'cup', 'shoes', 'park', 'book', 'play', 'bath', 'heart', 'store'];

const TITLE_DEBOUNCE_MS = 300;

interface BoardBuilderProps {
  board: Board;
  onBack: () => void;
  onOpenPicker: () => void;
  onPreview: (kind: BoardKind) => void;
  onKidMode: () => void;
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
  onKidMode,
}: BoardBuilderProps): JSX.Element => {
  const pictogramsById = usePictogramsById();
  const { data: allPictograms = [] } = usePictograms();

  const renameBoard = useRenameBoard();
  const setKind = useSetBoardKind();
  const setLabels = useSetLabelsVisible();
  const setVoice = useSetVoiceMode();
  const setStepIds = useSetStepIds();
  const setKidReorderable = useSetKidReorderable();

  // Local title state keeps the input snappy; the mutation fires once the user
  // pauses typing. Re-sync only when navigating to a different board — syncing
  // on every board.name change would clobber in-progress typing when the
  // previous debounced write lands.
  const [titleDraft, setTitleDraft] = useState(board.name);
  useEffect(() => setTitleDraft(board.name), [board.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const pendingTitleWrite = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueTitleWrite = (next: string): void => {
    setTitleDraft(next);
    if (pendingTitleWrite.current) clearTimeout(pendingTitleWrite.current);
    pendingTitleWrite.current = setTimeout(() => {
      renameBoard.mutate({ boardId: board.id, name: next });
    }, TITLE_DEBOUNCE_MS);
  };
  useEffect(
    () => () => {
      if (pendingTitleWrite.current) clearTimeout(pendingTitleWrite.current);
    },
    [],
  );

  const steps = useMemo(
    () => buildSteps(board.stepIds, pictogramsById),
    [board.stepIds, pictogramsById],
  );

  const quickAdd = useMemo(
    () =>
      QUICK_ADD_SLUGS.map((slug) => allPictograms.find((p) => p.slug === slug)).filter(
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
      onKidMode={onKidMode}
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
        value={titleDraft}
        onChange={(e) => queueTitleWrite(e.target.value)}
      />

      <SettingsRow
        kind={board.kind}
        onKindChange={(kind) => setKind.mutate({ boardId: board.id, kind })}
        labelsVisible={board.labelsVisible}
        onLabelsChange={(visible) => setLabels.mutate({ boardId: board.id, visible })}
        voiceMode={board.voiceMode}
        onVoiceModeChange={(mode) => setVoice.mutate({ boardId: board.id, mode })}
        kidReorderable={board.kidReorderable}
        onKidReorderableChange={(reorderable) =>
          setKidReorderable.mutate({ boardId: board.id, reorderable })
        }
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
