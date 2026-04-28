import type { JSX } from 'react';

import { ParentShell } from '@/layouts/ParentShell';
import { useKidModeNav } from '@/layouts/useKidModeNav';
import { useParentNav } from '@/layouts/useParentNav';
import { ComingSoon } from '@/ui/ComingSoon/ComingSoon';

import { DeleteAccountSection } from './DeleteAccountSection';

export const SettingsRoute = (): JSX.Element => {
  const onNav = useParentNav();
  const onKidMode = useKidModeNav();
  return (
    <ParentShell
      active="settings"
      onNav={onNav}
      onKidMode={onKidMode}
      title="Settings"
      subtitle="Coming soon"
    >
      <ComingSoon body="Account preferences, voice settings, and PIN management. Coming in a future release." />
      <DeleteAccountSection />
    </ParentShell>
  );
};
