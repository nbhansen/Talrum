import type { JSX } from 'react';

import { ParentShell } from '@/layouts/ParentShell';
import { useParentNav } from '@/layouts/useParentNav';
import { ComingSoon } from '@/ui/ComingSoon/ComingSoon';

export const SettingsRoute = (): JSX.Element => {
  const onNav = useParentNav();
  return (
    <ParentShell active="settings" onNav={onNav} title="Settings" subtitle="Coming soon">
      <ComingSoon body="Account preferences, voice settings, and PIN management. Coming in a future release." />
    </ParentShell>
  );
};
