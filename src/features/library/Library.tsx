import type { JSX } from 'react';

import { usePictograms } from '@/lib/queries/pictograms';
import { EmptyState } from '@/ui/EmptyState/EmptyState';
import { PictoCard } from '@/ui/PictoTile/PictoCard';

import styles from './Library.module.css';

export const Library = (): JSX.Element => {
  const { data: pictograms = [] } = usePictograms();

  if (pictograms.length === 0) {
    return (
      <EmptyState
        title="No pictograms yet"
        body="Pictograms you upload, generate, or pick from the library will show up here."
      />
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
