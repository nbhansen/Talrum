import type { JSX } from 'react';

import type { Pictogram } from '@/types/domain';
import { PictogramMedia } from '@/ui/PictoTile/PictogramMedia';

import styles from './KidSequence.module.css';

interface NextUpColumnProps {
  upcoming: readonly Pictogram[];
}

const EYEBROWS = ['Next', 'After that'];

export const NextUpColumn = ({ upcoming }: NextUpColumnProps): JSX.Element => (
  <div className={styles.nextColumn}>
    <div className={styles.thenHeading}>THEN</div>
    {upcoming.map((p, idx) => (
      <div key={`${p.id}-${idx}`} className={styles.nextItem} style={{ opacity: 1 - idx * 0.25 }}>
        <PictogramMedia picto={p} size={72} className={styles.nextMedia} />
        <div>
          <div className={styles.nextEyebrow}>{EYEBROWS[idx] ?? 'Later'}</div>
          <div className={styles.nextLabel}>{p.label}</div>
        </div>
      </div>
    ))}
    {upcoming.length === 0 && <div className={styles.finale}>🌿 Almost finished!</div>}
  </div>
);
