import { type JSX, useMemo, useState } from 'react';

import { usePictograms } from '@/lib/queries/pictograms';
import type { Pictogram } from '@/types/domain';
import { EmptyState } from '@/ui/EmptyState/EmptyState';
import { SearchIcon } from '@/ui/icons';
import { PictogramSheet } from '@/ui/PictogramSheet/PictogramSheet';
import { PictoTile } from '@/ui/PictoTile/PictoTile';

import styles from './Library.module.css';

export const Library = (): JSX.Element => {
  const { data: pictograms = [] } = usePictograms();
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<Pictogram | null>(null);

  const filtered = useMemo(() => {
    if (!query) return pictograms;
    const needle = query.toLowerCase();
    return pictograms.filter((p) => p.label.toLowerCase().includes(needle));
  }, [pictograms, query]);

  if (pictograms.length === 0) {
    return (
      <EmptyState
        title="No pictograms yet"
        body="Pictograms you upload, generate, or pick from the library will show up here."
      />
    );
  }

  return (
    <>
      <div className={styles.searchRow}>
        <SearchIcon size={18} />
        <input
          type="search"
          className={styles.searchInput}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search apple, park, happy…"
          aria-label="Search pictograms"
        />
      </div>
      {filtered.length === 0 ? (
        <p className={styles.emptyQuery}>No pictograms match &ldquo;{query}&rdquo;.</p>
      ) : (
        <div className={styles.grid}>
          {filtered.map((p) => (
            <PictoTile key={p.id} picto={p} size={120} onClick={() => setTarget(p)} />
          ))}
        </div>
      )}
      {target && <PictogramSheet picto={target} onClose={() => setTarget(null)} />}
    </>
  );
};
