import type { BoardKind } from '@/types/domain';

export const kindLabel = (kind: BoardKind): string => (kind === 'sequence' ? 'Sequence' : 'Choice');

export const kindUnit = (kind: BoardKind, count: number): string => {
  const singular = kind === 'sequence' ? 'step' : 'option';
  return count === 1 ? singular : `${singular}s`;
};

export const kindTileMarker = (kind: BoardKind, index: number): string =>
  kind === 'sequence' ? `STEP ${index + 1}` : `OPTION ${String.fromCharCode(65 + index)}`;
