import type { JSX, ReactNode } from 'react';

import styles from './PhotoPreviewCard.module.css';

interface Props {
  src: string;
  children: ReactNode;
  actions: ReactNode;
}

export const PhotoPreviewCard = ({ src, children, actions }: Props): JSX.Element => (
  <div className={styles.preview}>
    <img src={src} alt="" className={styles.image} />
    <div className={styles.side}>
      {children}
      <div className={styles.actions}>{actions}</div>
    </div>
  </div>
);
