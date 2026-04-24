import type { JSX } from 'react';

import { ParentShell } from '@/layouts/ParentShell';
import { useBoards } from '@/lib/queries/boards';
import { usePictograms } from '@/lib/queries/pictograms';
import { Button } from '@/ui/Button/Button';
import { PlusIcon } from '@/ui/icons';
import { PictoTile } from '@/ui/PictoTile/PictoTile';

import { BoardCard } from './BoardCard';
import styles from './ParentHome.module.css';

const RECENT_STRIP_IDS = ['wakeup', 'apple', 'zoo', 'bag', 'bath', 'book', 'play'];

interface ParentHomeProps {
  kidName?: string;
  onOpenBoard?: (id: string) => void;
  onKidMode?: () => void;
}

export const ParentHome = ({
  kidName = 'Liam',
  onOpenBoard,
  onKidMode,
}: ParentHomeProps): JSX.Element => {
  const boardsQuery = useBoards();
  const pictogramsQuery = usePictograms();

  const boards = boardsQuery.data ?? [];
  const pictogramsById = new Map((pictogramsQuery.data ?? []).map((p) => [p.id, p]));

  return (
    <ParentShell
      active="home"
      {...(onKidMode ? { onKidMode } : {})}
      title={`${kidName}'s boards`}
      subtitle="Pick a board to edit, or start a new one."
      right={
        <div className={styles.rightActions}>
          <Button variant="ghost" icon={<PlusIcon />}>
            New kid
          </Button>
          <Button variant="primary" icon={<PlusIcon />}>
            New board
          </Button>
        </div>
      }
    >
      <div className={styles.grid}>
        {boards.map((b) => (
          <BoardCard key={b.id} board={b} onClick={() => onOpenBoard?.(b.id)} />
        ))}
        <button type="button" className={styles.newTile}>
          <span className={styles.newTileIcon}>
            <PlusIcon size={22} />
          </span>
          New blank board
        </button>
      </div>
      <section className={styles.recent}>
        <div className={styles.recentHeader}>
          <h2 className={styles.recentHeading}>Recently added pictograms</h2>
          <button type="button" className={styles.seeAll}>
            See all
          </button>
        </div>
        <div className={`${styles.recentStrip} tal-scroll`}>
          {RECENT_STRIP_IDS.map((id) => {
            const p = pictogramsById.get(id);
            if (!p) return null;
            return (
              <div key={id} className={styles.recentItem}>
                <PictoTile picto={p} size={96} />
              </div>
            );
          })}
        </div>
      </section>
    </ParentShell>
  );
};
