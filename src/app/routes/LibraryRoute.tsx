import { type JSX, useState } from 'react';

import { Library } from '@/features/library/Library';
import { ParentShell } from '@/layouts/ParentShell';
import { Button } from '@/ui/Button/Button';
import { PlusIcon } from '@/ui/icons';
import { NewPictogramModal } from '@/widgets/NewPictogramModal/NewPictogramModal';

export const LibraryRoute = (): JSX.Element => {
  const [addOpen, setAddOpen] = useState(false);
  return (
    <>
      <ParentShell
        active="library"
        title="Library"
        subtitle="Every pictogram in your library — tap one to rename, replace its photo, record a voice, or delete."
        right={
          <Button variant="primary" icon={<PlusIcon />} onClick={() => setAddOpen(true)}>
            New pictogram
          </Button>
        }
      >
        <Library onAdd={() => setAddOpen(true)} />
      </ParentShell>
      {addOpen && <NewPictogramModal onClose={() => setAddOpen(false)} />}
    </>
  );
};
