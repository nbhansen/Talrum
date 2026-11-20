import type { JSX } from 'react';

import { setActiveKidId } from '@/lib/activeKid';
import { useActiveKid, useDeleteKid, useKids, useRenameKid } from '@/lib/queries/kids';
import type { Kid } from '@/types/domain';
import { Button } from '@/ui/Button/Button';
import { ConfirmDeleteRow } from '@/ui/ConfirmDeleteRow/ConfirmDeleteRow';
import { FormError } from '@/ui/FormError/FormError';
import { CheckIcon } from '@/ui/icons';
import { RenameSection, Sheet, SheetActions, SheetHint, SheetSection } from '@/ui/Sheet/Sheet';
import { useSheetAction } from '@/ui/Sheet/useSheetAction';

interface Props {
  kid: Kid;
  /** Number of boards owned by this kid, used in the delete-confirm hint. */
  boardCount: number;
  onClose: () => void;
}

const NAME_MAX = 40;

export const KidSheet = ({ kid, boardCount, onClose }: Props): JSX.Element => {
  const renameMut = useRenameKid();
  const deleteMut = useDeleteKid();
  const { data: kids = [] } = useKids();
  const activeKid = useActiveKid();
  const { error, run } = useSheetAction('KidSheet', onClose);

  const isLastKid = kids.length <= 1;
  const isActive = activeKid?.id === kid.id;
  const saving = renameMut.isPending || deleteMut.isPending;

  const onSetActive = (): void => {
    setActiveKidId(kid.id);
    onClose();
  };

  return (
    <Sheet
      title="Edit kid"
      subtitle={
        <>
          Rename, set active, or delete <strong>{kid.name}</strong>.
        </>
      }
      onClose={onClose}
    >
      <RenameSection
        label="Name"
        initial={kid.name}
        maxLength={NAME_MAX}
        saveLabel="Save name"
        saving={renameMut.isPending}
        disabled={saving}
        onSave={(name) =>
          run('rename', 'Rename failed.', () => renameMut.mutateAsync({ kidId: kid.id, name }))
        }
      />

      {!isLastKid && (
        <SheetSection label="Active kid">
          {isActive ? (
            <SheetHint>
              <strong>{kid.name}</strong> is the active kid. Parent home shows their boards.
            </SheetHint>
          ) : (
            <>
              <SheetHint>Parent home filters boards by active kid.</SheetHint>
              <SheetActions>
                <Button
                  variant="ghost"
                  icon={<CheckIcon size={14} />}
                  onClick={onSetActive}
                  disabled={saving}
                >
                  Set as active
                </Button>
              </SheetActions>
            </>
          )}
        </SheetSection>
      )}

      <SheetSection label="Delete" danger>
        {isLastKid ? (
          <SheetHint>You need at least one kid.</SheetHint>
        ) : (
          boardCount > 0 && (
            <SheetHint>
              Also deletes {boardCount} board{boardCount === 1 ? '' : 's'} for this kid.
            </SheetHint>
          )
        )}
        <ConfirmDeleteRow
          label="Delete kid"
          onConfirm={() =>
            run('delete', 'Delete failed.', () => deleteMut.mutateAsync({ kidId: kid.id }))
          }
          disabled={saving || isLastKid}
        />
      </SheetSection>

      {error && <FormError>{error}</FormError>}
    </Sheet>
  );
};
