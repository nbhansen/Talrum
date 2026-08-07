import type { JSX } from 'react';
import { useSearchParams } from 'react-router-dom';

import { AccountSection } from '@/features/settings/AccountSection';
import { AppVersionSection } from '@/features/settings/AppVersionSection';
import { DeleteAccountSection } from '@/features/settings/DeleteAccountSection';
import { LanguageSection } from '@/features/settings/LanguageSection';
import { PinManagementSection } from '@/features/settings/PinManagementSection';
import { SpeechPrefsSection } from '@/features/settings/SpeechPrefsSection';
import { ParentShell } from '@/layouts/ParentShell';
import { useKidModeNav } from '@/layouts/useKidModeNav';
import { useParentNav } from '@/layouts/useParentNav';

export const SettingsRoute = (): JSX.Element => {
  const onNav = useParentNav();
  const onKidMode = useKidModeNav();
  // The kid routes redirect here with ?pin=required (#353), so the section can
  // say why the parent was sent back.
  const [searchParams] = useSearchParams();
  const pinRequiredForKidMode = searchParams.get('pin') === 'required';
  return (
    <ParentShell
      active="settings"
      onNav={onNav}
      {...(onKidMode ? { onKidMode } : {})}
      title="Settings"
    >
      <AccountSection />
      <PinManagementSection pinRequiredForKidMode={pinRequiredForKidMode} />
      <LanguageSection />
      <SpeechPrefsSection />
      <AppVersionSection />
      <DeleteAccountSection />
    </ParentShell>
  );
};
