import { type FormEvent, useState } from 'react';

import {
  isAlreadyMemberError,
  isShareForbiddenError,
  useAddBoardMember,
} from '@/lib/queries/board-members';

// RFC 4122 v4 / v7 / generic UUID surface check. Supabase uses
// gen_random_uuid() (v4); browser-pasted IDs from a sibling user look the same.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ShareSubmitState {
  draftId: string;
  setDraftId: (next: string) => void;
  submitError: string | null;
  submitting: boolean;
  submit: (e: FormEvent) => void;
}

interface Args {
  boardId: string;
  meId: string;
}

/**
 * Owns the add-member submit flow for ShareModal: input draft state, UUID
 * surface validation, self-paste rejection, and the mutation call with
 * error-code → user-message mapping. ShareModal stays presentation-only.
 */
export const useShareSubmit = ({ boardId, meId }: Args): ShareSubmitState => {
  const addMember = useAddBoardMember();
  const [draftId, setDraftIdState] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const setDraftId = (next: string): void => {
    setDraftIdState(next);
    if (submitError) setSubmitError(null);
  };

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    const trimmed = draftId.trim().toLowerCase();
    if (!UUID_RE.test(trimmed)) {
      setSubmitError("That doesn't look like a valid sharing ID.");
      return;
    }
    if (trimmed === meId) {
      setSubmitError("That's your own sharing ID.");
      return;
    }
    setSubmitError(null);
    addMember.mutate(
      { boardId, userId: trimmed, role: 'viewer' },
      {
        onSuccess: () => {
          setDraftIdState('');
        },
        onError: (err) => {
          if (isAlreadyMemberError(err)) {
            setSubmitError('That person already has access to this board.');
            return;
          }
          if (isShareForbiddenError(err)) {
            setSubmitError("You can't share this board.");
            return;
          }
          setSubmitError("Couldn't add that person. Try again.");
        },
      },
    );
  };

  return {
    draftId,
    setDraftId,
    submitError,
    submitting: addMember.isPending,
    submit,
  };
};
