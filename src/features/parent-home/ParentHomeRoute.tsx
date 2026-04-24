import type { JSX } from 'react';
import { useNavigate } from 'react-router-dom';

import { ParentHome } from './ParentHome';

export const ParentHomeRoute = (): JSX.Element => {
  const navigate = useNavigate();
  return (
    <ParentHome
      onOpenBoard={(id) => navigate(`/boards/${id}/edit`)}
      onKidMode={() => navigate('/kid/sequence/morning')}
    />
  );
};
