import { type JSX, useState } from 'react';

import { type AppLanguage, getLanguagePref, isAppLanguage, setLanguagePref } from '@/lib/language';

import styles from './LanguageSection.module.css';

export const LanguageSection = (): JSX.Element => {
  const [pref, setPref] = useState<AppLanguage | null>(() => getLanguagePref());

  const onChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    const next = isAppLanguage(e.target.value) ? e.target.value : null;
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
        <label htmlFor="app-language" className={styles.label}>
          Language
        </label>
        <select id="app-language" className={styles.select} value={pref ?? ''} onChange={onChange}>
          <option value="">Automatic (device language)</option>
          <option value="da">Dansk</option>
          <option value="en">English</option>
        </select>
      </div>
    </section>
  );
};
