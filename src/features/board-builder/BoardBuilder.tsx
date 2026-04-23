import { Fragment, type JSX, useMemo, useState } from 'react';

import { PICTOGRAMS } from '@/data/pictograms';
import { ParentShell } from '@/layouts/ParentShell';
import type { Board, BoardKind, Pictogram, VoiceMode } from '@/types/domain';
import { Button } from '@/ui/Button/Button';
import { ArrowLeftIcon, PlayIcon, PlusIcon, StepArrowIcon } from '@/ui/icons';
import { PictoTile } from '@/ui/PictoTile/PictoTile';

import styles from './BoardBuilder.module.css';
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
  id: string;
  pictoId: string;
  picto: Pictogram;
}

let nextStepKey = 0;
const makeStep = (pictoId: string): Step => {
  const picto = PICTOGRAMS[pictoId];
  if (!picto) throw new Error(`Unknown pictogram ${pictoId}`);
  nextStepKey += 1;
  return { id: `step-${nextStepKey}`, pictoId, picto };
};

export const BoardBuilder = ({
  board,
  onBack,
  onOpenPicker,
  onPreview,
}: BoardBuilderProps): JSX.Element => {
  const [title, setTitle] = useState(board.name);
  const [kind, setKind] = useState<BoardKind>(board.kind);
  const [labelsVisible, setLabelsVisible] = useState(board.labelsVisible);
  const [voiceMode, setVoiceMode] = useState<VoiceMode>(board.voiceMode);
  const [steps, setSteps] = useState<Step[]>(() => board.stepIds.map(makeStep));

  const quickAdd = useMemo(
    () => QUICK_ADD_IDS.map((id) => PICTOGRAMS[id]).filter((p): p is Pictogram => Boolean(p)),
    [],
  );

  const removeAt = (stepId: string): void =>
    setSteps((prev) => prev.filter((s) => s.id !== stepId));
  const reorder = (nextIds: string[]): void =>
    setSteps((prev) => {
      const byId = new Map(prev.map((s) => [s.id, s]));
      return nextIds.map((id) => {
        const found = byId.get(id);
        if (!found) throw new Error(`Lost step during reorder: ${id}`);
        return found;
      });
    });
  const appendPicto = (pictoId: string): void => setSteps((prev) => [...prev, makeStep(pictoId)]);

  return (
    <ParentShell
      active="home"
      right={
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="ghost">Save</Button>
          <Button variant="primary" icon={<PlayIcon />} onClick={() => onPreview(kind)}>
            Preview for Liam
          </Button>
        </div>
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
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      <SettingsRow
        kind={kind}
        onKindChange={setKind}
        labelsVisible={labelsVisible}
        onLabelsChange={setLabelsVisible}
        voiceMode={voiceMode}
        onVoiceModeChange={setVoiceMode}
        stepCount={steps.length}
      />

      <div className={styles.track}>
        <div className={`${styles.rail} tal-scroll`}>
          <Reorderable
            items={steps}
            onReorder={reorder}
            renderItem={(step, i, drag) => (
              <Fragment key={step.id}>
                <StepTile
                  picto={step.picto}
                  index={i}
                  kind={kind}
                  labelsVisible={labelsVisible}
                  onRemove={() => removeAt(step.id)}
                  drag={drag}
                />
                {i < steps.length - 1 && (
                  <div className={styles.connector}>
                    {kind === 'sequence' ? (
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
