import { type JSX, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { KidModeGate } from '@/features/pin-gate/KidModeGate';
import { setLastBoard } from '@/lib/lastBoard';
import { useBoard } from '@/lib/queries/boards';

import { KidSequence } from './KidSequence';

export const KidSequenceRoute = (): JSX.Element | null => {
  const { boardId = '' } = useParams();
  const { data: board } = useBoard(boardId);
  const navigate = useNavigate();
  useEffect(() => {
    if (board) setLastBoard({ id: board.id, kind: 'sequence' });
  }, [board]);
  if (!board) return null;
  return (
    <KidModeGate onExitConfirmed={() => navigate(`/boards/${board.id}/edit`)}>
      {(requestExit) => <KidSequence board={board} onExit={requestExit} />}
    </KidModeGate>
  );
};
