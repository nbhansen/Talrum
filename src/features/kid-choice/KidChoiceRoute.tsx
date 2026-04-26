import { type JSX, useEffect } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';

import { clearLastBoard, setLastBoard } from '@/lib/lastBoard';
import { isNotFoundError, useBoard } from '@/lib/queries/boards';
import { KidModeGate } from '@/ui/KidModeGate/KidModeGate';

import { KidChoice } from './KidChoice';

export const KidChoiceRoute = (): JSX.Element | null => {
  const { boardId = '' } = useParams();
  const { data: board, error } = useBoard(boardId);
  const navigate = useNavigate();
  const stale = isNotFoundError(error);
  useEffect(() => {
    if (board) setLastBoard({ id: board.id, kind: board.kind });
    else if (stale) clearLastBoard();
  }, [board, stale]);
  if (stale) return <Navigate to="/" replace />;
  if (!board) return null;
  return (
    <KidModeGate onExitConfirmed={() => navigate(`/boards/${board.id}/edit`)}>
      {(requestExit) => <KidChoice board={board} onExit={requestExit} />}
    </KidModeGate>
  );
};
