import type { JSX } from 'react';

import { AccountSection } from '@/features/settings/AccountSection';
import { AppVersionSection } from '@/features/settings/AppVersionSection';
import { DeleteAccountSection } from '@/features/settings/DeleteAccountSection';
import { PinManagementSection } from '@/features/settings/PinManagementSection';
import { SpeechPrefsSection } from '@/features/settings/SpeechPrefsSection';
import { ParentShell } from '@/layouts/ParentShell';
import { useKidModeNav } from '@/layouts/useKidModeNav';
import { useParentNav } from '@/layouts/useParentNav';

export const SettingsRoute = (): JSX.Element => {
  const onNav = useParentNav();
  const onKidMode = useKidModeNav();
  return (
    <ParentShell active="settings" onNav={onNav} onKidMode={onKidMode} title="Settings">
      <AccountSection />
      <PinManagementSection />
      <SpeechPrefsSection />
      <AppVersionSection />
      <DeleteAccountSection />
    </ParentShell>
  );
};
