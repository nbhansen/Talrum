import type { JSX } from 'react';

import { AccountSection } from '@/features/settings/AccountSection';
import { DeleteAccountSection } from '@/features/settings/DeleteAccountSection';
import { ParentShell } from '@/layouts/ParentShell';
import { useKidModeNav } from '@/layouts/useKidModeNav';
import { useParentNav } from '@/layouts/useParentNav';

export const SettingsRoute = (): JSX.Element => {
  const onNav = useParentNav();
  const onKidMode = useKidModeNav();
  return (
    <ParentShell active="settings" onNav={onNav} onKidMode={onKidMode} title="Settings">
      <AccountSection />
      <DeleteAccountSection />
    </ParentShell>
  );
};
