import type { JSX } from 'react';

import type { Pictogram } from '@/types/domain';
import { SearchIcon } from '@/ui/icons';
import { PictoTile } from '@/widgets/PictoTile/PictoTile';
import { PictoVoiceButton } from '@/widgets/PictoVoiceButton/PictoVoiceButton';

import styles from './PictogramGrid.module.css';

interface PictogramGridProps {
  pictograms: readonly Pictogram[];
  query: string;
  onQueryChange: (next: string) => void;
  placeholder: string;
  tileSize: number;
  selected?: ReadonlySet<string>;
  onTileClick: (picto: Pictogram) => void;
  onEditVoice: (picto: Pictogram) => void;
}

export const PictogramGrid = ({
  pictograms,
  query,
  onQueryChange,
  placeholder,
  tileSize,
  selected,
  onTileClick,
  onEditVoice,
}: PictogramGridProps): JSX.Element => {
  const needle = query.toLowerCase();
  const filtered = needle
    ? pictograms.filter((p) => p.label.toLowerCase().includes(needle))
    : pictograms;
  return (
    <>
      <div className={styles.searchRow}>
        <SearchIcon size={18} />
        <input
          type="search"
          className={styles.searchInput}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={placeholder}
          aria-label="Search pictograms"
        />
      </div>
      {filtered.length === 0 && query ? (
        <p className={styles.emptyQuery}>No pictograms match &ldquo;{query}&rdquo;.</p>
      ) : (
        <div className={styles.grid}>
          {filtered.map((p) => (
            <div key={p.id} className={styles.entry}>
              <PictoTile
                picto={p}
                size={tileSize}
                selected={selected?.has(p.id) ?? false}
                onClick={() => onTileClick(p)}
              />
              <PictoVoiceButton picto={p} onClick={() => onEditVoice(p)} />
            </div>
          ))}
        </div>
      )}
    </>
  );
};
