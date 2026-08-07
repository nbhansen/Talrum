import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { useBoards } from '@/lib/queries/boards';
import { useActiveKid } from '@/lib/queries/kids';

// Picks the most recently updated non-empty board, preferring the active kid's.
// Empty boards are skipped because kid mode's empty state is a dead end, and
// undefined lets the shell disable the button rather than do nothing.
export const useKidModeNav = (): (() => void) | undefined => {
  const navigate = useNavigate();
  const boardsQuery = useBoards();
  const activeKid = useActiveKid();
  const nonEmpty = boardsQuery.data?.filter((b) => b.stepIds.length > 0) ?? [];
  const target = nonEmpty.find((b) => b.kidId === activeKid?.id) ?? nonEmpty[0];
  const targetPath = target ? `/kid/${target.kind}/${target.id}` : undefined;
  const go = useCallback(() => {
    if (targetPath) navigate(targetPath);
  }, [navigate, targetPath]);
  return targetPath ? go : undefined;
};
