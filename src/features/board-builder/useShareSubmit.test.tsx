import { act, renderHook } from '@testing-library/react';
import type { FormEvent } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as BoardMembersModule from '@/lib/queries/board-members';

const addMutateMock = vi.fn();
let lastAddOptions: { onSuccess?: () => void; onError?: (err: unknown) => void } | undefined;

const baseAddState = {
  mutate: (input: unknown, opts?: { onSuccess?: () => void; onError?: (err: unknown) => void }) => {
    lastAddOptions = opts;
    addMutateMock(input);
  },
  isPending: false,
};

let addState: typeof baseAddState = { ...baseAddState };

vi.mock('@/lib/queries/board-members', async (importActual) => {
  const actual = await importActual<typeof BoardMembersModule>();
  return {
    ...actual,
    useAddBoardMember: () => addState,
  };
});

const { useShareSubmit } = await import('./useShareSubmit');

const ME_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';
const BOARD_ID = 'board-1';

const fakeEvent = (): FormEvent => ({ preventDefault: () => undefined }) as FormEvent;

beforeEach(() => {
  addMutateMock.mockReset();
  addState = { ...baseAddState };
  lastAddOptions = undefined;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('useShareSubmit', () => {
  it('rejects a non-UUID draft with an inline error and skips the mutation', () => {
    const { result } = renderHook(() => useShareSubmit({ boardId: BOARD_ID, meId: ME_ID }));
    act(() => {
      result.current.setDraftId('not-a-uuid');
    });
    act(() => {
      result.current.submit(fakeEvent());
    });
    expect(result.current.submitError).toMatch(/doesn.?t look like a valid sharing ID/);
    expect(addMutateMock).not.toHaveBeenCalled();
  });

  it("rejects pasting one's own sharing ID", () => {
    const { result } = renderHook(() => useShareSubmit({ boardId: BOARD_ID, meId: ME_ID }));
    act(() => {
      result.current.setDraftId(ME_ID);
    });
    act(() => {
      result.current.submit(fakeEvent());
    });
    expect(result.current.submitError).toMatch(/your own sharing ID/);
    expect(addMutateMock).not.toHaveBeenCalled();
  });

  it('fires useAddBoardMember on a valid UUID and clears the draft on success', () => {
    const { result } = renderHook(() => useShareSubmit({ boardId: BOARD_ID, meId: ME_ID }));
    act(() => {
      result.current.setDraftId(OTHER_ID);
    });
    act(() => {
      result.current.submit(fakeEvent());
    });
    expect(addMutateMock).toHaveBeenCalledWith({
      boardId: BOARD_ID,
      userId: OTHER_ID,
      role: 'viewer',
    });
    act(() => {
      lastAddOptions?.onSuccess?.();
    });
    expect(result.current.draftId).toBe('');
  });

  it('maps a 23505 (already-member) error to the user-facing message', () => {
    const { result } = renderHook(() => useShareSubmit({ boardId: BOARD_ID, meId: ME_ID }));
    act(() => {
      result.current.setDraftId(OTHER_ID);
    });
    act(() => {
      result.current.submit(fakeEvent());
    });
    act(() => {
      lastAddOptions?.onError?.({ code: '23505', message: 'duplicate' });
    });
    expect(result.current.submitError).toMatch(/already has access/);
  });

  it('maps a forbidden (42501) error to the user-facing message', () => {
    const { result } = renderHook(() => useShareSubmit({ boardId: BOARD_ID, meId: ME_ID }));
    act(() => {
      result.current.setDraftId(OTHER_ID);
    });
    act(() => {
      result.current.submit(fakeEvent());
    });
    act(() => {
      lastAddOptions?.onError?.({ code: '42501', message: 'forbidden' });
    });
    expect(result.current.submitError).toMatch(/can.?t share this board/);
  });

  it('clears submitError when the user edits the draft', () => {
    const { result } = renderHook(() => useShareSubmit({ boardId: BOARD_ID, meId: ME_ID }));
    act(() => {
      result.current.setDraftId('not-a-uuid');
    });
    act(() => {
      result.current.submit(fakeEvent());
    });
    expect(result.current.submitError).not.toBeNull();
    act(() => {
      result.current.setDraftId('not-a-uuid-but-typing');
    });
    expect(result.current.submitError).toBeNull();
  });
});
