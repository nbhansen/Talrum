import type { JSX } from 'react';

import { usePictograms } from '@/lib/queries/pictograms';
import { PictoCard } from '@/ui/PictoTile/PictoCard';

import styles from './Library.module.css';

export const Library = (): JSX.Element => {
  const { data: pictograms = [] } = usePictograms();

  if (pictograms.length === 0) {
    return (
      <div className={styles.emptyState} role="status">
        <h2 className={styles.emptyTitle}>No pictograms yet</h2>
        <p className={styles.emptyBody}>
          Pictograms you upload, generate, or pick from the library will show up here.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.grid}>
      {pictograms.map((p) => (
        <PictoCard key={p.id} picto={p} size={120} />
      ))}
    </div>
  );
};
