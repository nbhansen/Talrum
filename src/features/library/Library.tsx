import { type JSX, useState } from 'react';

import { usePictograms } from '@/lib/queries/pictograms';
import type { Pictogram } from '@/types/domain';
import { Button } from '@/ui/Button/Button';
import { EmptyState } from '@/ui/EmptyState/EmptyState';
import { PlusIcon } from '@/ui/icons';
import { PictogramGrid } from '@/widgets/PictogramGrid/PictogramGrid';
import { PictogramSheet } from '@/widgets/PictogramSheet/PictogramSheet';
import { VoiceRecorderDialog } from '@/widgets/VoiceRecorderDialog/VoiceRecorderDialog';

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
      <PictogramGrid
        pictograms={pictograms}
        query={query}
        onQueryChange={setQuery}
        placeholder="Search apple, park, happy…"
        tileSize={120}
        onTileClick={setTarget}
        onEditVoice={(p) => setVoiceTargetId(p.id)}
      />
      {target && <PictogramSheet picto={target} onClose={() => setTarget(null)} />}
      {voiceTarget && (
        <VoiceRecorderDialog picto={voiceTarget} onClose={() => setVoiceTargetId(null)} />
      )}
    </>
  );
};
