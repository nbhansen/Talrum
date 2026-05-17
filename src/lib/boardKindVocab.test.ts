import { describe, expect, it } from 'vitest';

import { kindLabel, kindTileMarker, kindUnit } from './boardKindVocab';

describe('boardKindVocab', () => {
  describe('kindLabel', () => {
    it('returns "Sequence" for sequence boards', () => {
      expect(kindLabel('sequence')).toBe('Sequence');
    });

    it('returns "Choice" for choice boards', () => {
      expect(kindLabel('choice')).toBe('Choice');
    });
  });

  describe('kindUnit', () => {
    it('uses "step/steps" for sequence boards, pluralising on count', () => {
      expect(kindUnit('sequence', 0)).toBe('steps');
      expect(kindUnit('sequence', 1)).toBe('step');
      expect(kindUnit('sequence', 4)).toBe('steps');
    });

    it('uses "option/options" for choice boards, pluralising on count', () => {
      expect(kindUnit('choice', 0)).toBe('options');
      expect(kindUnit('choice', 1)).toBe('option');
      expect(kindUnit('choice', 4)).toBe('options');
    });
  });

  describe('kindTileMarker', () => {
    it('emits 1-based step numbers for sequence boards', () => {
      expect(kindTileMarker('sequence', 0)).toBe('STEP 1');
      expect(kindTileMarker('sequence', 2)).toBe('STEP 3');
    });

    it('emits A/B/C letters for choice boards', () => {
      expect(kindTileMarker('choice', 0)).toBe('OPTION A');
      expect(kindTileMarker('choice', 1)).toBe('OPTION B');
      expect(kindTileMarker('choice', 3)).toBe('OPTION D');
    });
  });
});
