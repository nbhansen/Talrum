import type { JSX } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useBoard } from '@/lib/queries/boards';

import { KidChoice } from './KidChoice';

export const KidChoiceRoute = (): JSX.Element | null => {
  const { boardId = '' } = useParams();
  const { data: board } = useBoard(boardId);
  const navigate = useNavigate();
  if (!board) return null;
  return <KidChoice board={board} onExit={() => navigate(`/boards/${board.id}/edit`)} />;
};
