import { describe, expect, it } from 'vitest';

import type { Pictogram } from '@/types/domain';

import { buildBoardSteps, reorderBoardSteps } from './boardSteps';

const picto = (id: string): Pictogram => ({
  id,
  label: id,
  style: 'illus',
  glyph: 'apple',
  tint: 'oklch(88% 0.05 20)',
});

const byId = new Map([
  ['a', picto('a')],
  ['b', picto('b')],
  ['c', picto('c')],
]);

describe('buildBoardSteps', () => {
  it('keeps the original stepIds index on each resolved step', () => {
    const steps = buildBoardSteps(['a', 'ghost', 'b'], byId);
    expect(steps.map((s) => s.pictoId)).toEqual(['a', 'b']);
    expect(steps.map((s) => s.stepIndex)).toEqual([0, 2]);
  });

  it('gives duplicate pictograms distinct slot keys', () => {
    const steps = buildBoardSteps(['a', 'a'], byId);
    expect(steps.map((s) => s.key)).toEqual(['a-0', 'a-1']);
  });
});

describe('reorderBoardSteps', () => {
  it('applies the permutation when every step resolves', () => {
    const stepIds = ['a', 'b', 'c'];
    const steps = buildBoardSteps(stepIds, byId);
    const result = reorderBoardSteps(stepIds, steps, ['c-2', 'a-0', 'b-1']);
    expect(result.stepIds).toEqual(['c', 'a', 'b']);
  });

  it('keeps unresolvable ids in their slots', () => {
    const stepIds = ['a', 'ghost', 'b'];
    const steps = buildBoardSteps(stepIds, byId);
    const result = reorderBoardSteps(stepIds, steps, ['b-2', 'a-0']);
    expect(result.stepIds).toEqual(['b', 'ghost', 'a']);
  });

  it('maps each moved key to the key of the slot it landed in', () => {
    const stepIds = ['a', 'ghost', 'b'];
    const steps = buildBoardSteps(stepIds, byId);
    const result = reorderBoardSteps(stepIds, steps, ['b-2', 'a-0']);
    expect(result.keyMap.get('b-2')).toBe('b-0');
    expect(result.keyMap.get('a-0')).toBe('a-2');
  });

  it('reorders duplicates of the same pictogram without collapsing them', () => {
    const stepIds = ['a', 'a', 'b'];
    const steps = buildBoardSteps(stepIds, byId);
    const result = reorderBoardSteps(stepIds, steps, ['b-2', 'a-0', 'a-1']);
    expect(result.stepIds).toEqual(['b', 'a', 'a']);
  });
});
