import { type JSX, useState } from 'react';

import { type AppLanguage, getAppLanguage, setLanguagePref } from '@/lib/language';
import { Select } from '@/ui/Select/Select';

import shared from './settings.module.css';

const OPTIONS = [
  { value: 'da', label: 'Dansk' },
  { value: 'en', label: 'English' },
] as const;

export const LanguageSection = (): JSX.Element => {
  const [pref, setPref] = useState<AppLanguage>(() => getAppLanguage());

  const onChange = (value: AppLanguage): void => {
    setPref(value);
    setLanguagePref(value);
  };

  return (
    <section>
      <h2>Language</h2>
      <p className={shared.muted}>
        Language for kid mode and the reading voice. Changes apply on the next tap.
      </p>
      <div className={shared.row}>
        <Select label="Language" layout="row" value={pref} onChange={onChange} options={OPTIONS} />
      </div>
    </section>
  );
};
