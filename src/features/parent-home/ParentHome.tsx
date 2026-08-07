import type { JSX } from 'react';

import { type ParentNavKey, ParentShell } from '@/layouts/ParentShell';
import { useBoards } from '@/lib/queries/boards';
import { setActiveKidId, useActiveKid, useKids } from '@/lib/queries/kids';
import { usePictogramsBySlug } from '@/lib/queries/pictograms';
import type { Pictogram } from '@/types/domain';
import { Button } from '@/ui/Button/Button';
import { EmptyState } from '@/ui/EmptyState/EmptyState';
import { PlusIcon } from '@/ui/icons';
import { KidSwitcher } from '@/ui/KidSwitcher/KidSwitcher';
import { PictoTile } from '@/widgets/PictoTile/PictoTile';

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
  /** Creates a default board and navigates into it. Omitted while kids load. */
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
  const { data: kids = [] } = useKids();
  const activeKid = useActiveKid();

  // Client-side, because every board row already carries kid_id. With no active
  // kid an empty list is correct — the EmptyState prompts to add one.
  const boards = (boardsQuery.data ?? []).filter((b) => b.kidId === activeKid?.id);
  const noBoards = boards.length === 0;
  const showSwitcher = kids.length > 1;

  // A heading alone over empty whitespace reads like a load failure.
  const recentPictos = RECENT_STRIP_SLUGS.map((slug) => pictogramsBySlug.get(slug)).filter(
    (p): p is Pictogram => Boolean(p),
  );

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
      {showSwitcher && (
        <KidSwitcher kids={kids} activeKidId={activeKid?.id ?? null} onSelect={setActiveKidId} />
      )}
      {noBoards ? (
        <EmptyState
          title="No boards yet"
          body="Create your first board to start communicating. You can add steps and tweak settings after."
          action={
            <Button variant="primary" icon={<PlusIcon />} onClick={onNewBoard}>
              Create your first board
            </Button>
          }
        />
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
      {recentPictos.length > 0 && (
        <section className={styles.recent}>
          <div className={styles.recentHeader}>
            <h2 className={styles.recentHeading}>Recently added pictograms</h2>
            <button type="button" className={styles.seeAll} onClick={onSeeAll}>
              See all
            </button>
          </div>
          <div className={`${styles.recentStrip} tal-scroll`}>
            {recentPictos.map((p) => (
              <div key={p.id} className={styles.recentItem}>
                <PictoTile picto={p} size={96} />
              </div>
            ))}
          </div>
        </section>
      )}
    </ParentShell>
  );
};
