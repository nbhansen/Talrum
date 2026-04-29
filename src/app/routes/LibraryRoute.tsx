import type { JSX } from 'react';

import { Library } from '@/features/library/Library';
import { ParentShell } from '@/layouts/ParentShell';
import { useKidModeNav } from '@/layouts/useKidModeNav';
import { useParentNav } from '@/layouts/useParentNav';

export const LibraryRoute = (): JSX.Element => {
  const onNav = useParentNav();
  const onKidMode = useKidModeNav();
  return (
    <ParentShell
      active="library"
      onNav={onNav}
      onKidMode={onKidMode}
      title="Library"
      subtitle="Every pictogram across your boards"
    >
      <Library />
    </ParentShell>
  );
};
