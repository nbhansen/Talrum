import { type JSX, useEffect } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';

import { KidChoice } from '@/features/kid-choice/KidChoice';
import { KidSequence } from '@/features/kid-sequence/KidSequence';
import { clearLastBoard, setLastBoard } from '@/lib/lastBoard';
import { isNotFoundError, useBoard } from '@/lib/queries/boards';
import type { BoardKind } from '@/types/domain';
import { KidModeGate } from '@/widgets/KidModeGate/KidModeGate';

const SCREENS = { choice: KidChoice, sequence: KidSequence } as const;

export const KidBoardRoute = ({ kind }: { kind: BoardKind }): JSX.Element | null => {
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
  const Screen = SCREENS[kind];
  return (
    <KidModeGate onExitConfirmed={() => navigate(`/boards/${board.id}/edit`)}>
      {(requestExit) => <Screen board={board} onExit={requestExit} />}
    </KidModeGate>
  );
};
