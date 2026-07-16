import { type JSX, useState } from 'react';

import { Library } from '@/features/library/Library';
import { ParentShell } from '@/layouts/ParentShell';
import { useKidModeNav } from '@/layouts/useKidModeNav';
import { useParentNav } from '@/layouts/useParentNav';
import { Button } from '@/ui/Button/Button';
import { PlusIcon } from '@/ui/icons';
import { NewPictogramModal } from '@/widgets/NewPictogramModal/NewPictogramModal';

export const LibraryRoute = (): JSX.Element => {
  const onNav = useParentNav();
  const onKidMode = useKidModeNav();
  const [addOpen, setAddOpen] = useState(false);
  return (
    <>
      <ParentShell
        active="library"
        onNav={onNav}
        {...(onKidMode ? { onKidMode } : {})}
        title="Library"
        subtitle="Every pictogram in your library — tap one to rename, replace its photo, or delete."
        right={
          <Button variant="primary" icon={<PlusIcon />} onClick={() => setAddOpen(true)}>
            Add pictogram
          </Button>
        }
      >
        <Library onAdd={() => setAddOpen(true)} />
      </ParentShell>
      {addOpen && <NewPictogramModal onClose={() => setAddOpen(false)} />}
    </>
  );
};
