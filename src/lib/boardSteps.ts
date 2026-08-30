import type { Pictogram } from '@/types/domain';

export interface BoardStep {
  /** Slot key, not pictogram id: a board may repeat the same pictogram (#273). */
  key: string;
  id: string;
  pictoId: string;
  picto: Pictogram;
  /** Index into board.stepIds. Rendered position drifts when a step is unresolvable. */
  stepIndex: number;
}

const slotKey = (pictoId: string, index: number): string => `${pictoId}-${index}`;

export const buildBoardSteps = (
  stepIds: readonly string[],
  byId: ReadonlyMap<string, Pictogram>,
): BoardStep[] =>
  stepIds.flatMap((pictoId, stepIndex) => {
    const picto = byId.get(pictoId);
    if (!picto) return [];
    const key = slotKey(pictoId, stepIndex);
    return [{ key, id: key, pictoId, picto, stepIndex }];
  });

export interface ReorderedSteps {
  stepIds: string[];
  /** Old slot key → the key of the slot the step landed in. */
  keyMap: Map<string, string>;
}

/**
 * Permutes the resolved steps across their own slots. Unresolvable ids keep
 * their positions — a drag must never delete them.
 */
export const reorderBoardSteps = (
  stepIds: readonly string[],
  steps: readonly BoardStep[],
  nextKeys: readonly string[],
): ReorderedSteps => {
  const byKey = new Map(steps.map((s) => [s.key, s]));
  const slots = steps.map((s) => s.stepIndex);
  const next = [...stepIds];
  const keyMap = new Map<string, string>();
  nextKeys.forEach((key, i) => {
    const step = byKey.get(key);
    const slot = slots[i];
    if (!step || slot === undefined) return;
    next[slot] = step.pictoId;
    keyMap.set(key, slotKey(step.pictoId, slot));
  });
  return { stepIds: next, keyMap };
};
