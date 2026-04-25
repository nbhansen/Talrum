import { type JSX, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import { getLastBoard, hasAutoLaunched, kidPathFor, markAutoLaunched } from '@/lib/lastBoard';
import { useBoards } from '@/lib/queries/boards';

import { ParentHome } from './ParentHome';

export const ParentHomeRoute = (): JSX.Element => {
  const navigate = useNavigate();
  const boardsQuery = useBoards();
  // Auto-launch into the last kid-mode board on the first parent-home visit
  // per browser session. Subsequent visits this session (e.g. after PIN exit
  // back to home) render ParentHome normally so the user is never trapped.
  const [redirect] = useState(() => {
    if (hasAutoLaunched()) return null;
    const last = getLastBoard();
    return last ? kidPathFor(last) : null;
  });
  useEffect(() => {
    markAutoLaunched();
  }, []);
  if (redirect) return <Navigate to={redirect} replace />;

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
    />
  );
};
