import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { useBoards } from '@/lib/queries/boards';
import { useActiveKid } from '@/lib/queries/kids';

// Resolves the parent shell's KID button into the board a kid would actually
// want: the most recently updated non-empty board (useBoards returns boards
// sorted by updated_at desc), preferring the active kid's boards and falling
// back to any kid's. Empty boards are skipped — kid mode's empty state is a
// dead end. Returns undefined when no board qualifies so the shell can
// disable the button instead of silently doing nothing. Routes that don't
// have their own board context (Library, Kids, Settings, ParentHome) share
// this hook; BoardBuilder keeps its own wiring because it launches into the
// board being edited.
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
