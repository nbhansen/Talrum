import type { JSX } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { KidModeGate } from '@/features/pin-gate/KidModeGate';
import { useBoard } from '@/lib/queries/boards';

import { KidSequence } from './KidSequence';

export const KidSequenceRoute = (): JSX.Element | null => {
  const { boardId = '' } = useParams();
  const { data: board } = useBoard(boardId);
  const navigate = useNavigate();
  if (!board) return null;
  return (
    <KidModeGate onExitConfirmed={() => navigate(`/boards/${board.id}/edit`)}>
      {(requestExit) => <KidSequence board={board} onExit={requestExit} />}
    </KidModeGate>
  );
};
