import type { Session, User } from '@supabase/supabase-js';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SessionContext } from '@/app/session';
import type { BoardMember } from '@/lib/queries/board-members';
import type * as BoardMembersModule from '@/lib/queries/board-members';

const useBoardMembersMock = vi.fn();
const addMutateMock = vi.fn();
const removeMutateMock = vi.fn();
let lastAddOptions: { onSuccess?: () => void; onError?: (err: unknown) => void } | undefined;

const baseAddState = {
  mutate: (
    input: unknown,
    opts?: { onSuccess?: () => void; onError?: (err: unknown) => void },
  ) => {
    lastAddOptions = opts;
    addMutateMock(input);
  },
  isPending: false,
};

let addState: typeof baseAddState = { ...baseAddState };

const removeState = {
  mutate: (input: unknown) => {
    removeMutateMock(input);
  },
  isPending: false,
};

vi.mock('@/lib/queries/board-members', async (importActual) => {
  const actual = await importActual<typeof BoardMembersModule>();
  return {
    ...actual,
    useBoardMembers: () => useBoardMembersMock(),
    useAddBoardMember: () => addState,
    useRemoveBoardMember: () => removeState,
  };
});

const { ShareModal } = await import('./ShareModal');

const ME_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';

const fakeUser = (id: string): User =>
  ({
    id,
    email: 'me@example.com',
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: '2026-04-25T00:00:00Z',
  }) as User;

const renderModal = (
  members: BoardMember[],
  isOwner = true,
  meId = ME_ID,
): { onClose: ReturnType<typeof vi.fn> } => {
  const onClose = vi.fn();
  useBoardMembersMock.mockReturnValue({ data: members, isSuccess: true });
  const Wrapper = ({ children }: { children: JSX.Element }): JSX.Element => (
    <SessionContext.Provider
      value={{
        session: {} as Session,
        user: fakeUser(meId),
        signOut: async () => undefined,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
  render(
    <Wrapper>
      <ShareModal boardId="board-1" isOwner={isOwner} onClose={onClose} />
    </Wrapper>,
  );
  return { onClose };
};

beforeEach(() => {
  addMutateMock.mockReset();
  removeMutateMock.mockReset();
  useBoardMembersMock.mockReset();
  addState = { ...baseAddState };
  lastAddOptions = undefined;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('ShareModal — owner', () => {
  it('renders the three sections (sharing ID, members, add form)', () => {
    renderModal([
      { boardId: 'board-1', userId: OTHER_ID, role: 'viewer' },
    ]);
    expect(screen.getByText('Your sharing ID')).toBeInTheDocument();
    expect(screen.getByText('Shared with')).toBeInTheDocument();
    expect(screen.getByText('Add someone')).toBeInTheDocument();
    // The sharing ID is shown verbatim so the owner can copy it.
    expect(screen.getByText(ME_ID)).toBeInTheDocument();
    // The member is rendered with their role.
    expect(screen.getByText(OTHER_ID)).toBeInTheDocument();
    expect(screen.getByText('viewer')).toBeInTheDocument();
  });

  it('shows "No one yet." when the board has no members', () => {
    renderModal([]);
    expect(screen.getByText('No one yet.')).toBeInTheDocument();
  });

  it('rejects a non-UUID input with an inline error and does not fire the mutation', () => {
    renderModal([]);
    fireEvent.change(screen.getByLabelText('Sharing ID'), { target: { value: 'not-a-uuid' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('alert')).toHaveTextContent("doesn't look like a valid sharing ID");
    expect(addMutateMock).not.toHaveBeenCalled();
  });

  it("rejects pasting one's own sharing ID with an inline error", () => {
    renderModal([]);
    fireEvent.change(screen.getByLabelText('Sharing ID'), { target: { value: ME_ID } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('alert')).toHaveTextContent("your own sharing ID");
    expect(addMutateMock).not.toHaveBeenCalled();
  });

  it('fires useAddBoardMember on a valid UUID and clears the input on success', async () => {
    renderModal([]);
    const input = screen.getByLabelText('Sharing ID') as HTMLInputElement;
    fireEvent.change(input, { target: { value: OTHER_ID } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(addMutateMock).toHaveBeenCalledWith({
      boardId: 'board-1',
      userId: OTHER_ID,
      role: 'viewer',
    });
    act(() => {
      lastAddOptions?.onSuccess?.();
    });
    await waitFor(() => expect(input.value).toBe(''));
  });

  it('renders an inline error when the mutation reports a 23505 (already a member)', async () => {
    renderModal([]);
    fireEvent.change(screen.getByLabelText('Sharing ID'), { target: { value: OTHER_ID } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    act(() => {
      lastAddOptions?.onError?.({ code: '23505', message: 'duplicate' });
    });
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('already has access'),
    );
  });

  it('fires useRemoveBoardMember when an X button is clicked on a member row', () => {
    renderModal([
      { boardId: 'board-1', userId: OTHER_ID, role: 'viewer' },
    ]);
    fireEvent.click(screen.getByRole('button', { name: `Remove ${OTHER_ID}` }));
    expect(removeMutateMock).toHaveBeenCalledWith({
      boardId: 'board-1',
      userId: OTHER_ID,
    });
  });

  it('closes when the close button is clicked', () => {
    const { onClose } = renderModal([]);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('ShareModal — non-owner', () => {
  it('shows the sharing ID but hides the members + add sections', () => {
    renderModal(
      [{ boardId: 'board-1', userId: OTHER_ID, role: 'viewer' }],
      false,
      OTHER_ID,
    );
    expect(screen.getByText('Your sharing ID')).toBeInTheDocument();
    expect(screen.queryByText('Shared with')).not.toBeInTheDocument();
    expect(screen.queryByText('Add someone')).not.toBeInTheDocument();
  });
});
