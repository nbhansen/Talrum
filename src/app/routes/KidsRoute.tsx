import { type JSX, useState } from 'react';

import { Kids } from '@/features/kids/Kids';
import { ParentShell } from '@/layouts/ParentShell';
import { Button } from '@/ui/Button/Button';
import { PlusIcon } from '@/ui/icons';
import { NewKidModal } from '@/widgets/NewKidModal/NewKidModal';

export const KidsRoute = (): JSX.Element => {
  const [newKidOpen, setNewKidOpen] = useState(false);
  return (
    <>
      <ParentShell
        active="kids"
        title="Kids"
        subtitle="Tap a kid to rename, delete, or set them as active."
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
