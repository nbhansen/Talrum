import type { JSX } from 'react';

import type { Pictogram } from '@/types/domain';
import { SearchIcon } from '@/ui/icons';
import { PictoTile } from '@/widgets/PictoTile/PictoTile';
import { PictoVoiceButton } from '@/widgets/PictoVoiceButton/PictoVoiceButton';

import styles from './LibraryTab.module.css';

interface LibraryTabProps {
  pictograms: readonly Pictogram[];
  query: string;
  onQueryChange: (next: string) => void;
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onEditVoice: (picto: Pictogram) => void;
}

export const LibraryTab = ({
  pictograms,
  query,
  onQueryChange,
  selected,
  onToggle,
  onEditVoice,
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
      </div>
      <div className={styles.grid}>
        {filtered.map((p) => (
          <div key={p.id} className={styles.entry}>
            <PictoTile
              picto={p}
              size={110}
              selected={selected.has(p.id)}
              onClick={() => onToggle(p.id)}
            />
            <PictoVoiceButton picto={p} onClick={() => onEditVoice(p)} />
          </div>
        ))}
      </div>
    </div>
  );
};
