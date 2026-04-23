import type { JSX } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { getBoard } from '@/data/boards';

import { KidChoice } from './KidChoice';

export const KidChoiceRoute = (): JSX.Element => {
  const { boardId = '' } = useParams();
  const board = getBoard(boardId);
  const navigate = useNavigate();
  return <KidChoice board={board} onExit={() => navigate(`/boards/${board.id}/edit`)} />;
};
