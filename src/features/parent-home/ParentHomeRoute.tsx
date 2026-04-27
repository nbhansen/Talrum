import { type JSX, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import { useKidModeNav } from '@/layouts/useKidModeNav';
import { useParentNav } from '@/layouts/useParentNav';
import { getLastBoard, hasAutoLaunched, kidPathFor, markAutoLaunched } from '@/lib/lastBoard';
import { useBoards, useCreateBoard } from '@/lib/queries/boards';
import { useKids } from '@/lib/queries/kids';
import { accentForIndex } from '@/theme/tokens';
import { NewKidModal } from '@/ui/NewKidModal/NewKidModal';

import { NewBoardModal } from './NewBoardModal';
import { ParentHome } from './ParentHome';

export const ParentHomeRoute = (): JSX.Element => {
  const navigate = useNavigate();
  const onNav = useParentNav();
  const onKidMode = useKidModeNav();
  const boardsQuery = useBoards();
  const kidsQuery = useKids();
  const createBoard = useCreateBoard();
  const [newKidOpen, setNewKidOpen] = useState(false);
  const [newBoardOpen, setNewBoardOpen] = useState(false);
  // Auto-launch into the last kid-mode board on the first parent-home visit
  // per browser session. Subsequent visits this session (e.g. after PIN exit
  // back to home) render ParentHome normally so the user is never trapped.
  const [redirect] = useState(() => {
    if (hasAutoLaunched()) return null;
    const last = getLastBoard();
    return last ? kidPathFor(last) : null;
  });
  useEffect(() => {
    markAutoLaunched();
  }, []);
  if (redirect) return <Navigate to={redirect} replace />;

  const firstKid = kidsQuery.data?.[0];
  const boardCount = boardsQuery.data?.length ?? 0;

  // Fast-path create: skip the modal, drop a board with default values, and
  // navigate straight into the BoardBuilder where the user names + tunes it.
  // Accent rotates by current board count so the grid stays visually distinct.
  const onNewBlankBoard = (): void => {
    if (!firstKid || createBoard.isPending) return;
    createBoard.mutate(
      {
        name: 'Untitled board',
        kind: 'sequence',
        kidId: firstKid.id,
        accent: accentForIndex(boardCount),
      },
      {
        onSuccess: (board) => navigate(`/boards/${board.id}/edit`),
      },
    );
  };

  return (
    <>
      <ParentHome
        {...(firstKid ? { kidName: firstKid.name } : {})}
        onOpenBoard={(id) => navigate(`/boards/${id}/edit`)}
        onKidMode={onKidMode}
        onNav={onNav}
        onNewKid={() => setNewKidOpen(true)}
        onNewBoard={() => setNewBoardOpen(true)}
        onNewBlankBoard={onNewBlankBoard}
        onSeeAll={() => navigate('/library')}
        newBlankPending={createBoard.isPending}
      />
      {newKidOpen && <NewKidModal onClose={() => setNewKidOpen(false)} />}
      {newBoardOpen && (
        <NewBoardModal
          onClose={() => setNewBoardOpen(false)}
          onCreated={(boardId) => navigate(`/boards/${boardId}/edit`)}
        />
      )}
    </>
  );
};
