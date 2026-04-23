import type { JSX } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { getBoard } from '@/data/boards';

import { KidSequence } from './KidSequence';

export const KidSequenceRoute = (): JSX.Element => {
  const { boardId = '' } = useParams();
  const board = getBoard(boardId);
  const navigate = useNavigate();
  return <KidSequence board={board} onExit={() => navigate(`/boards/${board.id}/edit`)} />;
};
