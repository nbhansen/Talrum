import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { useBoards } from '@/lib/queries/boards';

// Resolves the parent shell's KID button into a navigation into the first
// sequence board the user owns. Routes that don't have their own board
// context (Library, Kids, Settings, ParentHome) share this hook so the KID
// button works consistently from anywhere in the parent shell. BoardBuilder
// keeps its own wiring because it launches into the board being edited.
export const useKidModeNav = (): (() => void) => {
  const navigate = useNavigate();
  const boardsQuery = useBoards();
  const firstSequence = boardsQuery.data?.find((b) => b.kind === 'sequence');
  return useCallback(() => {
    if (firstSequence) navigate(`/kid/sequence/${firstSequence.id}`);
  }, [navigate, firstSequence]);
};
