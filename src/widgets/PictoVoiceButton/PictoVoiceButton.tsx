import type { JSX } from 'react';

import type { Pictogram } from '@/types/domain';
import { IconButton } from '@/ui/IconButton/IconButton';
import { MicIcon } from '@/ui/icons';

import styles from './PictoVoiceButton.module.css';

interface PictoVoiceButtonProps {
  picto: Pictogram;
  onClick: () => void;
}

/** Sits on the corner of a tile. The parent of the tile must be `position: relative`. */
export const PictoVoiceButton = ({ picto, onClick }: PictoVoiceButtonProps): JSX.Element => (
  <IconButton
    variant="raised"
    className={[styles.micBtn, picto.audioPath ? styles.micBtnHasAudio : null]
      .filter(Boolean)
      .join(' ')}
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
    aria-label={
      picto.audioPath
        ? `Edit voice recording for ${picto.label}`
        : `Record voice for ${picto.label}`
    }
    title={picto.audioPath ? 'Edit recording' : 'Record voice'}
  >
    <MicIcon size={14} />
  </IconButton>
);
