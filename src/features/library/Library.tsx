import { type JSX, useMemo, useState } from 'react';

import { usePictograms } from '@/lib/queries/pictograms';
import type { Pictogram } from '@/types/domain';
import { Button } from '@/ui/Button/Button';
import { EmptyState } from '@/ui/EmptyState/EmptyState';
import { PlusIcon, SearchIcon } from '@/ui/icons';
import { PictogramSheet } from '@/widgets/PictogramSheet/PictogramSheet';
import { PictoTile } from '@/widgets/PictoTile/PictoTile';
import { PictoVoiceButton } from '@/widgets/PictoVoiceButton/PictoVoiceButton';
import { VoiceRecorderDialog } from '@/widgets/VoiceRecorderDialog/VoiceRecorderDialog';

import styles from './Library.module.css';

interface LibraryProps {
  /** Opens the New pictogram modal (owned by the route, like KidsRoute). */
  onAdd?: () => void;
}

export const Library = ({ onAdd }: LibraryProps): JSX.Element => {
  const { data: pictograms = [] } = usePictograms();
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<Pictogram | null>(null);
  const [voiceTargetId, setVoiceTargetId] = useState<string | null>(null);
  const voiceTarget = pictograms.find((p) => p.id === voiceTargetId);

  const filtered = useMemo(() => {
    if (!query) return pictograms;
    const needle = query.toLowerCase();
    return pictograms.filter((p) => p.label.toLowerCase().includes(needle));
  }, [pictograms, query]);

  if (pictograms.length === 0) {
    return (
      <EmptyState
        title="No pictograms yet"
        body="Pictograms you upload or pick from the library will show up here."
        action={
          <Button variant="primary" icon={<PlusIcon />} onClick={onAdd}>
            Add your first pictogram
          </Button>
        }
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
            <div key={p.id} className={styles.entry}>
              <PictoTile picto={p} size={120} onClick={() => setTarget(p)} />
              <PictoVoiceButton picto={p} onClick={() => setVoiceTargetId(p.id)} />
            </div>
          ))}
        </div>
      )}
      {target && <PictogramSheet picto={target} onClose={() => setTarget(null)} />}
      {voiceTarget && (
        <VoiceRecorderDialog picto={voiceTarget} onClose={() => setVoiceTargetId(null)} />
      )}
    </>
  );
};
