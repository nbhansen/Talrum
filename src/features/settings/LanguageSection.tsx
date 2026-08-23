import { type JSX, useState } from 'react';

import { type AppLanguage, getLanguagePref, isAppLanguage, setLanguagePref } from '@/lib/language';
import { Select } from '@/ui/Select/Select';

import styles from './LanguageSection.module.css';

const OPTIONS = [
  { value: '', label: 'Automatic (device language)' },
  { value: 'da', label: 'Dansk' },
  { value: 'en', label: 'English' },
] as const;

export const LanguageSection = (): JSX.Element => {
  const [pref, setPref] = useState<AppLanguage | null>(() => getLanguagePref());

  const onChange = (value: string): void => {
    const next = isAppLanguage(value) ? value : null;
    setPref(next);
    setLanguagePref(next);
  };

  return (
    <section>
      <h2>Language</h2>
      <p className={styles.muted}>
        Language for kid mode and the reading voice. Changes apply on the next tap.
      </p>
      <div className={styles.row}>
        <Select
          label="Language"
          layout="row"
          value={pref ?? ''}
          onChange={onChange}
          options={OPTIONS}
        />
      </div>
    </section>
  );
};
