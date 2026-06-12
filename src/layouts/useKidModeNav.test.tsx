import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Board } from '@/types/domain';
import type { Kid } from '@/types/domain';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, useNavigate: () => navigateMock };
});

const useBoardsMock = vi.fn(() => ({ data: [] as Board[] }));
vi.mock('@/lib/queries/boards', () => ({
  useBoards: () => useBoardsMock(),
}));

const useActiveKidMock = vi.fn((): Kid | null => null);
vi.mock('@/lib/queries/kids', () => ({
  useActiveKid: () => useActiveKidMock(),
}));

const { useKidModeNav } = await import('./useKidModeNav');

// Boards arrive from useBoards sorted by updated_at desc; fixtures below are
// listed in that order.
const board = (over: Partial<Board>): Board => ({
  id: 'b1',
  ownerId: 'owner',
  kidId: 'k1',
  name: 'Board',
  kind: 'sequence',
  labelsVisible: true,
  voiceMode: 'tts',
  stepIds: ['p1'],
  kidReorderable: false,
  accent: 'sage',
  updatedLabel: 'just now',
  serverUpdatedAt: '2026-01-01T00:00:00Z',
  ...over,
});

const kid = (id: string): Kid => ({ id, ownerId: 'owner', name: id });

const wrapper = ({ children }: { children: ReactNode }): ReactNode => (
  <MemoryRouter>{children}</MemoryRouter>
);

const run = (): (() => void) | undefined =>
  renderHook(() => useKidModeNav(), { wrapper }).result.current;

beforeEach(() => {
  navigateMock.mockReset();
  useBoardsMock.mockReturnValue({ data: [] });
  useActiveKidMock.mockReturnValue(null);
});

describe('useKidModeNav', () => {
  it("prefers the active kid's most recent non-empty board over a newer board of another kid", () => {
    useBoardsMock.mockReturnValue({
      data: [
        board({ id: 'other-kid-newer', kidId: 'k2' }),
        board({ id: 'active-kid-board', kidId: 'k1', kind: 'choice' }),
      ],
    });
    useActiveKidMock.mockReturnValue(kid('k1'));

    run()?.();
    expect(navigateMock).toHaveBeenCalledWith('/kid/choice/active-kid-board');
  });

  it("skips empty boards and falls back to another kid's non-empty board", () => {
    useBoardsMock.mockReturnValue({
      data: [
        board({ id: 'active-but-empty', kidId: 'k1', stepIds: [] }),
        board({ id: 'other-kid-full', kidId: 'k2' }),
      ],
    });
    useActiveKidMock.mockReturnValue(kid('k1'));

    run()?.();
    expect(navigateMock).toHaveBeenCalledWith('/kid/sequence/other-kid-full');
  });

  it('routes by board kind', () => {
    useBoardsMock.mockReturnValue({ data: [board({ id: 'c1', kind: 'choice' })] });

    run()?.();
    expect(navigateMock).toHaveBeenCalledWith('/kid/choice/c1');
  });

  it('returns undefined when every board is empty, so the KID button can disable', () => {
    useBoardsMock.mockReturnValue({ data: [board({ stepIds: [] })] });
    expect(run()).toBeUndefined();
  });

  it('returns undefined when there are no boards at all', () => {
    expect(run()).toBeUndefined();
  });
});
