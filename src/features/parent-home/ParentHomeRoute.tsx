import type { JSX } from 'react';
import { useNavigate } from 'react-router-dom';

import { getBoard } from '@/data/boards';

import { ParentHome } from './ParentHome';

export const ParentHomeRoute = (): JSX.Element => {
  const navigate = useNavigate();
  return (
    <ParentHome
      onOpenBoard={(id) => {
        const board = getBoard(id);
        if (board.kind === 'choice') {
          navigate(`/boards/${id}/edit`);
        } else {
          navigate(`/boards/${id}/edit`);
        }
      }}
      onKidMode={() => navigate('/kid/sequence/morning')}
    />
  );
};
