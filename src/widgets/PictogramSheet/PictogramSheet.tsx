import { type JSX, useMemo, useState } from 'react';

import { useBoards } from '@/lib/queries/boards.read';
import {
  referencingBoardIds,
  useDeletePictogram,
  usePictograms,
  useRenamePictogram,
  useReplacePictogramImage,
} from '@/lib/queries/pictograms';
import { useImagePicker } from '@/lib/useImagePicker';
import type { Pictogram } from '@/types/domain';
import { Button } from '@/ui/Button/Button';
import { FormError } from '@/ui/FormError/FormError';
import { MicIcon, UploadIcon } from '@/ui/icons';
import {
  DeleteSection,
  RenameSection,
  Sheet,
  SheetActions,
  SheetHint,
  SheetSection,
} from '@/ui/Sheet/Sheet';
import { useSheetAction } from '@/ui/Sheet/useSheetAction';
import { PictogramMedia } from '@/widgets/PictoTile/PictogramMedia';
import { VoiceRecorderDialog } from '@/widgets/VoiceRecorderDialog/VoiceRecorderDialog';

import styles from './PictogramSheet.module.css';

interface Props {
  picto: Pictogram;
  onClose: () => void;
}

const LABEL_MAX = 40;

export const PictogramSheet = ({ picto, onClose }: Props): JSX.Element => {
  const [recordingVoice, setRecordingVoice] = useState(false);
  // The hosts capture `picto` at tap time; audio saved while the sheet is
  // open lands in the pictograms cache, so the voice section follows that.
  const livePicto = usePictograms().data?.find((p) => p.id === picto.id) ?? picto;
  const { error, setError, run } = useSheetAction('PictogramSheet', onClose);
  const { inputProps, processed, processing, error: pickError, pickFile } = useImagePicker();

  const renameMut = useRenamePictogram();
  const replaceMut = useReplacePictogramImage();
  const deleteMut = useDeletePictogram();
  const { data: boards } = useBoards();
  const referencedBoardIds = useMemo(
    () => referencingBoardIds(picto.id, boards),
    [picto.id, boards],
  );

  const saving = renameMut.isPending || replaceMut.isPending || deleteMut.isPending;
  const busy = processing || saving;
  const shownError = error ?? pickError;

  return (
    <Sheet
      title="Edit pictogram"
      subtitle="Rename, replace the photo, record a voice, or delete it."
      onClose={onClose}
    >
      <div className={styles.preview}>
        <PictogramMedia picto={picto} size={140} />
      </div>

      <RenameSection
        label="Label"
        initial={picto.label}
        maxLength={LABEL_MAX}
        saveLabel="Save label"
        saving={renameMut.isPending}
        disabled={busy}
        onSave={(label) =>
          run('rename', 'Rename failed.', () =>
            renameMut.mutateAsync({ pictogramId: picto.id, label }),
          )
        }
      />

      {picto.style === 'photo' && (
        <SheetSection label="Photo">
          <input
            {...inputProps}
            onChange={(e) => {
              // Picking a file starts a fresh attempt, so stale errors go.
              setError(null);
              inputProps.onChange(e);
            }}
          />
          {processed ? (
            <div className={styles.photoPreview}>
              <img src={processed.previewUrl} alt="" className={styles.photoPreviewImg} />
              <Button variant="ghost" onClick={pickFile} disabled={busy}>
                Choose another
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              icon={<UploadIcon size={16} />}
              onClick={pickFile}
              disabled={busy}
            >
              {processing ? 'Preparing…' : 'Choose a new photo'}
            </Button>
          )}
          <SheetActions>
            <Button
              variant="primary"
              onClick={() => {
                if (!processed) return;
                run('replace-photo', 'Photo replace failed.', () =>
                  replaceMut.mutateAsync({
                    pictogramId: picto.id,
                    blob: processed.blob,
                    extension: processed.extension,
                  }),
                );
              }}
              disabled={!processed || busy}
            >
              Replace photo
            </Button>
          </SheetActions>
        </SheetSection>
      )}

      <SheetSection label="Voice">
        <SheetActions>
          <Button
            variant="ghost"
            icon={<MicIcon size={14} />}
            onClick={() => setRecordingVoice(true)}
            disabled={busy}
          >
            {livePicto.audioPath ? 'Edit recording' : 'Record voice'}
          </Button>
        </SheetActions>
      </SheetSection>

      <DeleteSection
        label="Delete pictogram"
        onConfirm={() =>
          run('delete', 'Delete failed.', () => deleteMut.mutateAsync({ pictogramId: picto.id }))
        }
        disabled={busy}
      >
        {referencedBoardIds.length > 0 && (
          <SheetHint>
            Used on {referencedBoardIds.length} board
            {referencedBoardIds.length === 1 ? '' : 's'}. Deleting removes it from{' '}
            {referencedBoardIds.length === 1 ? 'that board' : 'those boards'} too.
          </SheetHint>
        )}
      </DeleteSection>

      {shownError && <FormError>{shownError}</FormError>}
      {recordingVoice && (
        <VoiceRecorderDialog picto={livePicto} onClose={() => setRecordingVoice(false)} />
      )}
    </Sheet>
  );
};
