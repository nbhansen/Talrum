import type { JSX } from 'react';

import { ParentShell } from '@/layouts/ParentShell';
import { setActiveKidId } from '@/lib/activeKid';
import { useBoards, useCreateBoard } from '@/lib/queries/boards';
import { useActiveKid, useKids } from '@/lib/queries/kids';
import { usePictogramsForSlugs } from '@/lib/queries/pictograms';
import { accentForIndex } from '@/theme/tokens';
import { Button } from '@/ui/Button/Button';
import { EmptyState } from '@/ui/EmptyState/EmptyState';
import { PlusIcon } from '@/ui/icons';
import { KidSwitcher } from '@/ui/KidSwitcher/KidSwitcher';
import { PictoCard } from '@/widgets/PictoTile/PictoCard';

import { BoardCard } from './BoardCard';
import styles from './ParentHome.module.css';

const RECENT_STRIP_SLUGS = ['wakeup', 'apple', 'zoo', 'bag', 'bath', 'book', 'play'];

interface ParentHomeProps {
  onOpenBoard: (id: string) => void;
  onNewKid: () => void;
  /** Opens the full New board modal (name + kind + kid picker). */
  onNewBoard: () => void;
  onSeeAll: () => void;
}

export const ParentHome = ({
  onOpenBoard,
  onNewKid,
  onNewBoard,
  onSeeAll,
}: ParentHomeProps): JSX.Element => {
  const boardsQuery = useBoards();
  const createBoard = useCreateBoard();
  const { data: kids = [] } = useKids();
  const activeKid = useActiveKid();

  // Filter is client-side: every board row already carries kid_id, so there's
  // no need for a separate query per kid. Without an active kid (no kids yet)
  // an empty list is correct — the EmptyState below prompts to add one.
  const boards = (boardsQuery.data ?? []).filter((b) => b.kidId === activeKid?.id);
  const noBoards = boards.length === 0;
  const showSwitcher = kids.length > 1;

  // Only render the strip when at least one slug resolves — otherwise the
  // heading sits alone over empty whitespace and reads like a load failure.
  const recentPictos = usePictogramsForSlugs(RECENT_STRIP_SLUGS);

  // Skips the modal: the BoardBuilder is where the board gets named. The accent
  // rotates by board count so the grid stays visually distinct.
  const onNewBlankBoard = (): void => {
    if (!activeKid || createBoard.isPending) return;
    createBoard.mutate(
      {
        name: 'Untitled board',
        kind: 'sequence',
        kidId: activeKid.id,
        accent: accentForIndex(boardsQuery.data?.length ?? 0),
      },
      { onSuccess: (board) => onOpenBoard(board.id) },
    );
  };

  return (
    <ParentShell
      active="home"
      title={activeKid ? `${activeKid.name}'s boards` : 'Boards'}
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
            <BoardCard key={b.id} board={b} onClick={() => onOpenBoard(b.id)} />
          ))}
          <button
            type="button"
            className={styles.newTile}
            onClick={onNewBlankBoard}
            disabled={createBoard.isPending}
          >
            <span className={styles.newTileIcon}>
              <PlusIcon size={22} />
            </span>
            {createBoard.isPending ? 'Creating…' : 'New blank board'}
          </button>
        </div>
      )}
      {recentPictos.length > 0 && (
        <section className={styles.recent}>
          <div className={styles.recentHeader}>
            <h2 className={styles.recentHeading}>From the library</h2>
            <button type="button" className={styles.seeAll} onClick={onSeeAll}>
              See all
            </button>
          </div>
          <div className={`${styles.recentStrip} tal-scroll`}>
            {recentPictos.map((p) => (
              <div key={p.id} className={styles.recentItem}>
                <PictoCard picto={p} size={96} />
              </div>
            ))}
          </div>
        </section>
      )}
    </ParentShell>
  );
};
