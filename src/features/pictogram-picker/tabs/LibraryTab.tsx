import type { JSX } from 'react';

import type { Pictogram } from '@/types/domain';
import { Chip } from '@/ui/Chip/Chip';
import { SearchIcon } from '@/ui/icons';
import { PictoTile } from '@/ui/PictoTile/PictoTile';

import styles from './LibraryTab.module.css';

interface LibraryTabProps {
  pictograms: readonly Pictogram[];
  query: string;
  onQueryChange: (next: string) => void;
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
}

export const LibraryTab = ({
  pictograms,
  query,
  onQueryChange,
  selected,
  onToggle,
}: LibraryTabProps): JSX.Element => {
  const filtered = query
    ? pictograms.filter((p) => p.label.toLowerCase().includes(query.toLowerCase()))
    : pictograms;
  return (
    <div className={styles.wrap}>
      <div className={styles.searchRow}>
        <SearchIcon size={18} />
        <input
          className={styles.searchInput}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search eat, dress, happy, park…"
        />
        <div className={styles.filters}>
          <Chip active>All</Chip>
          <Chip>Illustrated</Chip>
          <Chip>Photos</Chip>
          <Chip>Mine</Chip>
        </div>
      </div>
      <div className={styles.grid}>
        {filtered.map((p) => (
          <PictoTile
            key={p.id}
            picto={p}
            size={110}
            selected={selected.has(p.id)}
            onClick={() => onToggle(p.id)}
          />
        ))}
      </div>
    </div>
  );
};
