import { type JSX, useState } from 'react';

import { ParentShell } from '@/layouts/ParentShell';
import { useKidModeNav } from '@/layouts/useKidModeNav';
import { useParentNav } from '@/layouts/useParentNav';
import { Button } from '@/ui/Button/Button';
import { PlusIcon } from '@/ui/icons';
import { NewKidModal } from '@/ui/NewKidModal/NewKidModal';

import { Kids } from './Kids';

export const KidsRoute = (): JSX.Element => {
  const onNav = useParentNav();
  const onKidMode = useKidModeNav();
  const [newKidOpen, setNewKidOpen] = useState(false);
  return (
    <>
      <ParentShell
        active="kids"
        onNav={onNav}
        onKidMode={onKidMode}
        title="Kids"
        subtitle="The kids you're creating boards for"
        right={
          <Button variant="primary" icon={<PlusIcon />} onClick={() => setNewKidOpen(true)}>
            New kid
          </Button>
        }
      >
        <Kids onNewKid={() => setNewKidOpen(true)} />
      </ParentShell>
      {newKidOpen && <NewKidModal onClose={() => setNewKidOpen(false)} />}
    </>
  );
};
