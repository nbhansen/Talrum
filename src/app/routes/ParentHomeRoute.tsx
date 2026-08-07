import { type JSX, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import { ParentHome } from '@/features/parent-home/ParentHome';
import { useKidModeNav } from '@/layouts/useKidModeNav';
import { useParentNav } from '@/layouts/useParentNav';
import { getLastBoard, hasAutoLaunched, kidPathFor, markAutoLaunched } from '@/lib/lastBoard';
import { kidModeNeedsPinSetup } from '@/lib/pin';
import { useBoards, useCreateBoard } from '@/lib/queries/boards';
import { useActiveKid } from '@/lib/queries/kids';
import { accentForIndex } from '@/theme/tokens';
import { NewBoardModal } from '@/widgets/NewBoardModal/NewBoardModal';
import { NewKidModal } from '@/widgets/NewKidModal/NewKidModal';

export const ParentHomeRoute = (): JSX.Element => {
  const navigate = useNavigate();
  const onNav = useParentNav();
  const onKidMode = useKidModeNav();
  const boardsQuery = useBoards();
  const activeKid = useActiveKid();
  const createBoard = useCreateBoard();
  const [newKidOpen, setNewKidOpen] = useState(false);
  const [newBoardOpen, setNewBoardOpen] = useState(false);
  // Once per browser session, so a PIN exit back to home does not trap the
  // parent in a relaunch loop.
  const [redirect] = useState(() => {
    if (hasAutoLaunched()) return null;
    // Without a PIN the kid route bounces to Settings, so auto-launching would
    // yank the parent there on boot (#353).
    if (kidModeNeedsPinSetup()) return null;
    const last = getLastBoard();
    return last ? kidPathFor(last) : null;
  });
  useEffect(() => {
    markAutoLaunched();
  }, []);
  if (redirect) return <Navigate to={redirect} replace />;

  const boardCount = boardsQuery.data?.length ?? 0;

  // Skips the modal: the BoardBuilder is where the board gets named. The accent
  // rotates by board count so the grid stays visually distinct.
  const onNewBlankBoard = (): void => {
    if (!activeKid || createBoard.isPending) return;
    createBoard.mutate(
      {
        name: 'Untitled board',
        kind: 'sequence',
        kidId: activeKid.id,
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
        {...(activeKid ? { kidName: activeKid.name } : {})}
        onOpenBoard={(id) => navigate(`/boards/${id}/edit`)}
        {...(onKidMode ? { onKidMode } : {})}
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
