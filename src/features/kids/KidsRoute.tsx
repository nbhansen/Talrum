import type { JSX } from 'react';

import { ParentShell } from '@/layouts/ParentShell';
import { useParentNav } from '@/layouts/useParentNav';
import { ComingSoon } from '@/ui/ComingSoon/ComingSoon';

export const KidsRoute = (): JSX.Element => {
  const onNav = useParentNav();
  return (
    <ParentShell active="kids" onNav={onNav} title="Kids" subtitle="Coming soon">
      <ComingSoon body="Manage kid profiles and their boards from one place. Coming in a future release." />
    </ParentShell>
  );
};
