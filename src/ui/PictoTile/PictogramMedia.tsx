import type { CSSProperties, JSX } from 'react';

import { Glyph } from '@/glyphs/Glyph';
import { PhotoPlaceholder } from '@/glyphs/PhotoPlaceholder';
import type { Pictogram } from '@/types/domain';

import styles from './PictogramMedia.module.css';

interface PictogramMediaProps {
  picto: Pictogram;
  size: number;
  selected?: boolean | undefined;
  /** Override border radius (rarely needed). */
  radius?: string | undefined;
  className?: string | undefined;
}

/**
 * Renders just the square pictogram surface: tinted background for
 * illustrated pictos, striped placeholder for photo pictos. Used standalone
 * (e.g. the big NOW card in kid-sequence) and composed inside PictoTile.
 */
export const PictogramMedia = ({
  picto,
  size,
  selected = false,
  radius,
  className,
}: PictogramMediaProps): JSX.Element => {
  const isPhoto = picto.style === 'photo';
  const style: CSSProperties = {
    width: size,
    height: size,
    ...(isPhoto ? {} : { background: picto.tint }),
    ...(radius ? { borderRadius: radius } : {}),
  };
  const classes = [styles.media, isPhoto && styles.photo, selected && styles.selected, className]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={classes} style={style}>
      {isPhoto ? (
        <PhotoPlaceholder label={picto.label} />
      ) : (
        <Glyph name={picto.glyph} size={size * 0.58} />
      )}
    </div>
  );
};
