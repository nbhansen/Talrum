import type { JSX } from 'react';

import { ParentShell } from '@/layouts/ParentShell';
import { useKidModeNav } from '@/layouts/useKidModeNav';
import { useParentNav } from '@/layouts/useParentNav';

import { AccountSection } from './AccountSection';
import { DeleteAccountSection } from './DeleteAccountSection';

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
