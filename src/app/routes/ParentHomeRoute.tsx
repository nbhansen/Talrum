import { type JSX, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import { ParentHome } from '@/features/parent-home/ParentHome';
import { getLastBoardId, hasAutoLaunched, kidPathFor, markAutoLaunched } from '@/lib/lastBoard';
import { hasPin } from '@/lib/pin';
import { NewBoardModal } from '@/widgets/NewBoardModal/NewBoardModal';
import { NewKidModal } from '@/widgets/NewKidModal/NewKidModal';

export const ParentHomeRoute = (): JSX.Element => {
  const navigate = useNavigate();
  const [newKidOpen, setNewKidOpen] = useState(false);
  const [newBoardOpen, setNewBoardOpen] = useState(false);
  // Once per browser session, so a PIN exit back to home does not trap the
  // parent in a relaunch loop.
  const [redirect] = useState(() => {
    if (hasAutoLaunched()) return null;
    // Without a PIN the kid route bounces to Settings, so auto-launching would
    // yank the parent there on boot (#353).
    if (!hasPin()) return null;
    const last = getLastBoardId();
    return last ? kidPathFor(last) : null;
  });
  useEffect(() => {
    markAutoLaunched();
  }, []);
  if (redirect) return <Navigate to={redirect} replace />;

  const openBoard = (id: string): void => void navigate(`/boards/${id}/edit`);

  return (
    <>
      <ParentHome
        onOpenBoard={openBoard}
        onNewKid={() => setNewKidOpen(true)}
        onNewBoard={() => setNewBoardOpen(true)}
        onSeeAll={() => navigate('/library')}
      />
      {newKidOpen && <NewKidModal onClose={() => setNewKidOpen(false)} />}
      {newBoardOpen && (
        <NewBoardModal onClose={() => setNewBoardOpen(false)} onCreated={openBoard} />
      )}
    </>
  );
};
