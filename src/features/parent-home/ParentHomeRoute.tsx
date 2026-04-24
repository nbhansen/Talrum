import type { JSX } from 'react';
import { useNavigate } from 'react-router-dom';

import { useBoards } from '@/lib/queries/boards';
import { supabase } from '@/lib/supabase';
import { useUserInitial } from '@/lib/useUserInitial';

import { ParentHome } from './ParentHome';

export const ParentHomeRoute = (): JSX.Element => {
  const navigate = useNavigate();
  const boardsQuery = useBoards();
  const userInitial = useUserInitial();

  // Always expose onKidMode once boards have loaded — during the initial
  // fetch we route to a stable placeholder that'll redirect as soon as the
  // query settles. Avoids a visible flicker of the KID button in the sidebar.
  const firstSequence = boardsQuery.data?.find((b) => b.kind === 'sequence');
  const onKidMode = (): void => {
    if (firstSequence) navigate(`/kid/sequence/${firstSequence.id}`);
  };

  return (
    <ParentHome
      onOpenBoard={(id) => navigate(`/boards/${id}/edit`)}
      onKidMode={onKidMode}
      onSignOut={() => {
        void supabase.auth.signOut();
      }}
      userInitial={userInitial}
    />
  );
};
