import type { JSX } from 'react';

import { ParentShell } from '@/layouts/ParentShell';
import { useParentNav } from '@/layouts/useParentNav';

import { Library } from './Library';

export const LibraryRoute = (): JSX.Element => {
  const onNav = useParentNav();
  return (
    <ParentShell
      active="library"
      onNav={onNav}
      title="Library"
      subtitle="Every pictogram across your boards"
    >
      <Library />
    </ParentShell>
  );
};
