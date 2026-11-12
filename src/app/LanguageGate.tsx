import { type JSX, type ReactNode, useState } from 'react';

import { type AppLanguage, getLanguagePref, setLanguagePref } from '@/lib/language';
import { Button } from '@/ui/Button/Button';

import styles from './LanguageGate.module.css';

/** Asks for the language one time on a device that has none stored (#745). */
export const LanguageGate = ({ children }: { children: ReactNode }): JSX.Element => {
  const [chosen, setChosen] = useState(() => getLanguagePref() !== null);
  if (chosen) return <>{children}</>;

  const choose = (lang: AppLanguage): void => {
    setLanguagePref(lang);
    setChosen(true);
  };

  // Both languages, because no language is known yet.
  return (
    <main className={styles.wrap} role="main">
      <h1 className={styles.title}>Sprog · Language</h1>
      <p className={styles.body} lang="da">
        Vælg sproget til børnetilstand, oplæsning og genererede billeder. Du kan ændre det under
        Settings.
      </p>
      <p className={styles.body}>
        Choose the language for kid mode, the reading voice and generated images. You can change it
        in Settings.
      </p>
      <div className={styles.actions}>
        <Button variant="primary" lang="da" onClick={() => choose('da')}>
          Dansk
        </Button>
        <Button variant="primary" onClick={() => choose('en')}>
          English
        </Button>
      </div>
    </main>
  );
};
