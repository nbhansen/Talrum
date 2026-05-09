import { type JSX, useMemo, useState } from 'react';

import { useBoards } from '@/lib/queries/boards';
import { useActiveKid, useKids } from '@/lib/queries/kids';
import type { Kid } from '@/types/domain';
import { Button } from '@/ui/Button/Button';
import { EmptyState } from '@/ui/EmptyState/EmptyState';
import { PlusIcon } from '@/ui/icons';
import { KidSheet } from '@/ui/KidSheet/KidSheet';

import styles from './Kids.module.css';

interface KidsProps {
  onNewKid?: () => void;
}

export const Kids = ({ onNewKid }: KidsProps): JSX.Element => {
  const { data: kids = [] } = useKids();
  const { data: boards } = useBoards();
  const activeKid = useActiveKid();
  const [sheetTarget, setSheetTarget] = useState<Kid | null>(null);

  const boardCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of boards ?? []) {
      counts.set(b.kidId, (counts.get(b.kidId) ?? 0) + 1);
    }
    return counts;
  }, [boards]);

  if (kids.length === 0) {
    return (
      <EmptyState
        title="No kids yet"
        body="Add a kid to start creating boards for them. Each kid has their own boards."
        action={
          <Button variant="primary" icon={<PlusIcon />} onClick={onNewKid}>
            Add your first kid
          </Button>
        }
      />
    );
  }

  return (
    <>
      <ul className={styles.list}>
        {kids.map((kid) => {
          const count = boardCounts.get(kid.id) ?? 0;
          const isActive = activeKid?.id === kid.id;
          return (
            <li key={kid.id}>
              <button
                type="button"
                className={styles.row}
                onClick={() => setSheetTarget(kid)}
                aria-label={`Edit ${kid.name}`}
              >
                <span className={styles.name}>{kid.name}</span>
                {isActive && <span className={styles.badge}>Active</span>}
                <span className={styles.count}>
                  {count} board{count === 1 ? '' : 's'}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {sheetTarget && (
        <KidSheet
          kid={sheetTarget}
          boardCount={boardCounts.get(sheetTarget.id) ?? 0}
          onClose={() => setSheetTarget(null)}
        />
      )}
    </>
  );
};
