import type { JSX } from 'react';

import shared from './settings.module.css';

export const AppVersionSection = (): JSX.Element => (
  <section>
    <h2>About</h2>
    <p className={shared.muted}>
      Talrum version{' '}
      <code className={shared.strong}>
        {__APP_VERSION__} ({__APP_COMMIT__})
      </code>
    </p>
  </section>
);
