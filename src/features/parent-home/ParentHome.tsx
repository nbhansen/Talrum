import type { JSX } from 'react';

import { type ParentNavKey, ParentShell } from '@/layouts/ParentShell';
import { useBoards } from '@/lib/queries/boards';
import { usePictogramsBySlug } from '@/lib/queries/pictograms';
import { Button } from '@/ui/Button/Button';
import { PlusIcon } from '@/ui/icons';
import { PictoTile } from '@/ui/PictoTile/PictoTile';

import { BoardCard } from './BoardCard';
import styles from './ParentHome.module.css';

const RECENT_STRIP_SLUGS = ['wakeup', 'apple', 'zoo', 'bag', 'bath', 'book', 'play'];

interface ParentHomeProps {
  kidName?: string;
  onOpenBoard?: (id: string) => void;
  onKidMode?: () => void;
  onNav?: (id: ParentNavKey) => void;
  onNewKid?: () => void;
  /** Opens the full New board modal (name + kind + kid picker). */
  onNewBoard?: () => void;
  /**
   * Fast path: creates a board with default values immediately and navigates
   * into the BoardBuilder. Disabled when no kids are loaded yet (the route
   * passes a no-op or omits the prop while waiting on the kids query).
   */
  onNewBlankBoard?: () => void;
  onSeeAll?: () => void;
  newBlankPending?: boolean;
}

export const ParentHome = ({
  kidName,
  onOpenBoard,
  onKidMode,
  onNav,
  onNewKid,
  onNewBoard,
  onNewBlankBoard,
  onSeeAll,
  newBlankPending = false,
}: ParentHomeProps): JSX.Element => {
  const boardsQuery = useBoards();
  const pictogramsBySlug = usePictogramsBySlug();

  const boards = boardsQuery.data ?? [];
  const noBoards = boards.length === 0;

  return (
    <ParentShell
      active="home"
      {...(onNav ? { onNav } : {})}
      {...(onKidMode ? { onKidMode } : {})}
      title={kidName ? `${kidName}'s boards` : 'Boards'}
      subtitle="Pick a board to edit, or start a new one."
      right={
        <div className={styles.rightActions}>
          <Button variant="ghost" icon={<PlusIcon />} onClick={onNewKid}>
            New kid
          </Button>
          <Button variant="primary" icon={<PlusIcon />} onClick={onNewBoard}>
            New board
          </Button>
        </div>
      }
    >
      {noBoards ? (
        <div className={styles.emptyState} role="status">
          <h2 className={styles.emptyTitle}>No boards yet</h2>
          <p className={styles.emptyBody}>
            Create your first board to start communicating. You can add steps and tweak settings
            after.
          </p>
          <Button variant="primary" icon={<PlusIcon />} onClick={onNewBoard}>
            Create your first board
          </Button>
        </div>
      ) : (
        <div className={styles.grid}>
          {boards.map((b) => (
            <BoardCard key={b.id} board={b} onClick={() => onOpenBoard?.(b.id)} />
          ))}
          <button
            type="button"
            className={styles.newTile}
            onClick={onNewBlankBoard}
            disabled={newBlankPending}
          >
            <span className={styles.newTileIcon}>
              <PlusIcon size={22} />
            </span>
            {newBlankPending ? 'Creating…' : 'New blank board'}
          </button>
        </div>
      )}
      <section className={styles.recent}>
        <div className={styles.recentHeader}>
          <h2 className={styles.recentHeading}>Recently added pictograms</h2>
          <button type="button" className={styles.seeAll} onClick={onSeeAll}>
            See all
          </button>
        </div>
        <div className={`${styles.recentStrip} tal-scroll`}>
          {RECENT_STRIP_SLUGS.map((slug) => {
            const p = pictogramsBySlug.get(slug);
            if (!p) return null;
            return (
              <div key={slug} className={styles.recentItem}>
                <PictoTile picto={p} size={96} />
              </div>
            );
          })}
        </div>
      </section>
    </ParentShell>
  );
};
