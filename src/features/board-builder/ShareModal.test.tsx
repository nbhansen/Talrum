import type { Session, User } from '@supabase/supabase-js';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SessionContext } from '@/lib/auth/session';
import type * as BoardMembersModule from '@/lib/queries/board-members';
import type { BoardMember } from '@/lib/queries/board-members';

const useBoardMembersMock = vi.fn();
const removeMutateMock = vi.fn();

const addMutateMock = vi.fn();
let lastAddOptions: { onSuccess: () => void; onError: (err: unknown) => void } | undefined;

vi.mock('@/lib/queries/board-members', async (importActual) => {
  const actual = await importActual<typeof BoardMembersModule>();
  return {
    ...actual,
    useBoardMembers: () => useBoardMembersMock(),
    useAddBoardMember: () => ({
      mutate: (input: unknown, opts: typeof lastAddOptions) => {
        lastAddOptions = opts;
        addMutateMock(input);
      },
      isPending: false,
    }),
    useRemoveBoardMember: () => ({ mutate: removeMutateMock, isPending: false }),
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
  isOwner = true,
  members: { data: BoardMember[] | undefined; isPending?: boolean } = { data: [] },
): { onClose: ReturnType<typeof vi.fn> } => {
  const onClose = vi.fn();
  useBoardMembersMock.mockReturnValue(members);
  render(
    <SessionContext value={{ user: fakeUser(ME_ID) } as Session}>
      <ShareModal boardId="board-1" isOwner={isOwner} onClose={onClose} />
    </SessionContext>,
  );
  return { onClose };
};

const otherMember: BoardMember = { boardId: 'board-1', userId: OTHER_ID, role: 'viewer' };

const submitId = (id: string): void => {
  fireEvent.change(screen.getByLabelText('Sharing ID'), { target: { value: id } });
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
};

afterEach(() => {
  vi.clearAllMocks();
  lastAddOptions = undefined;
});

describe('ShareModal — owner', () => {
  it('renders the three sections (sharing ID, members, add form)', () => {
    renderModal(true, { data: [otherMember] });
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
    renderModal();
    expect(screen.getByText('No one yet.')).toBeInTheDocument();
  });

  it('fires useRemoveBoardMember when an X button is clicked on a member row', () => {
    renderModal(true, { data: [otherMember] });
    fireEvent.click(screen.getByRole('button', { name: `Remove ${OTHER_ID}` }));
    expect(removeMutateMock).toHaveBeenCalledWith({
      boardId: 'board-1',
      userId: OTHER_ID,
    });
  });

  it('closes when the close button is clicked', () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('ShareModal — non-owner', () => {
  it('shows the sharing ID but hides the members + add sections', () => {
    renderModal(false, { data: [otherMember] });
    expect(screen.getByText('Your sharing ID')).toBeInTheDocument();
    expect(screen.queryByText('Shared with')).not.toBeInTheDocument();
    expect(screen.queryByText('Add someone')).not.toBeInTheDocument();
  });

  it('does not claim the member can share or delete (#496)', () => {
    renderModal(false);
    expect(screen.getByText(/only its owner can share or delete it/)).toBeInTheDocument();
    expect(screen.queryByText(/Only you can share or delete it/)).not.toBeInTheDocument();
  });
});

describe('ShareModal — members loading state (#35)', () => {
  it('renders "Loading…" instead of "No one yet." while the query is pending', () => {
    renderModal(true, { data: undefined, isPending: true });
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByText('No one yet.')).not.toBeInTheDocument();
  });
});

describe('ShareModal — add someone', () => {
  it('rejects a malformed ID and does not send it', () => {
    renderModal();
    submitId('not-a-uuid');
    expect(screen.getByText(/doesn.?t look like a valid sharing ID/)).toBeInTheDocument();
    expect(addMutateMock).not.toHaveBeenCalled();
  });

  it("rejects the user's own sharing ID", () => {
    renderModal();
    submitId(ME_ID);
    expect(screen.getByText(/your own sharing ID/)).toBeInTheDocument();
    expect(addMutateMock).not.toHaveBeenCalled();
  });

  it('adds a valid ID as an editor and empties the field on success', () => {
    renderModal();
    submitId(OTHER_ID);
    expect(addMutateMock).toHaveBeenCalledWith({
      boardId: 'board-1',
      userId: OTHER_ID,
      role: 'editor',
    });
    act(() => lastAddOptions?.onSuccess());
    expect(screen.getByLabelText('Sharing ID')).toHaveValue('');
  });

  it.each([
    ['23505', /already has access/],
    ['42501', /can.?t share this board/],
    ['XX000', /Couldn.?t add that person/],
  ])('explains a %s failure', (code, message) => {
    renderModal();
    submitId(OTHER_ID);
    act(() => lastAddOptions?.onError({ code, message: 'failed' }));
    expect(screen.getByText(message)).toBeInTheDocument();
  });

  it('removes the error when the user edits the ID', () => {
    renderModal();
    submitId('not-a-uuid');
    fireEvent.change(screen.getByLabelText('Sharing ID'), { target: { value: 'not-a-uuid-2' } });
    expect(screen.queryByText(/valid sharing ID/)).not.toBeInTheDocument();
  });
});
