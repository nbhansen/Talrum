import { type JSX, useState } from 'react';

import { type AppLanguage, getAppLanguage, isAppLanguage, setLanguagePref } from '@/lib/language';
import { Select } from '@/ui/Select/Select';

import styles from './LanguageSection.module.css';

const OPTIONS = [
  { value: 'da', label: 'Dansk' },
  { value: 'en', label: 'English' },
] as const;

export const LanguageSection = (): JSX.Element => {
  const [pref, setPref] = useState<AppLanguage>(() => getAppLanguage());

  const onChange = (value: string): void => {
    if (!isAppLanguage(value)) return;
    setPref(value);
    setLanguagePref(value);
  };

  return (
    <section>
      <h2>Language</h2>
      <p className={styles.muted}>
        Language for kid mode and the reading voice. Changes apply on the next tap.
      </p>
      <div className={styles.row}>
        <Select label="Language" layout="row" value={pref} onChange={onChange} options={OPTIONS} />
      </div>
    </section>
  );
};
