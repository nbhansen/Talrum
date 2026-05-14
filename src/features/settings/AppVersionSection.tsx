import type { JSX } from 'react';

import styles from './AppVersionSection.module.css';

export const AppVersionSection = (): JSX.Element => (
  <section>
    <h2>About</h2>
    <p className={styles.line}>
      Talrum version <code className={styles.version}>{__APP_VERSION__}</code>
    </p>
  </section>
);
