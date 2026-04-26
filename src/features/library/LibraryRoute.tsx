import type { JSX } from 'react';

import { ParentShell } from '@/layouts/ParentShell';
import { useParentNav } from '@/layouts/useParentNav';
import { ComingSoon } from '@/ui/ComingSoon/ComingSoon';

export const LibraryRoute = (): JSX.Element => {
  const onNav = useParentNav();
  return (
    <ParentShell active="library" onNav={onNav} title="Library" subtitle="Coming soon">
      <ComingSoon body="Browse and manage every pictogram across your boards. Coming in a future release." />
    </ParentShell>
  );
};
