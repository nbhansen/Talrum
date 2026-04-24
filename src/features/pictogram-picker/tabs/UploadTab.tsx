import type { JSX } from 'react';

import { usePictogramsById } from '@/lib/queries/pictograms';
import { Button } from '@/ui/Button/Button';
import { UploadIcon } from '@/ui/icons';
import { PictoTile } from '@/ui/PictoTile/PictoTile';

import styles from './UploadTab.module.css';

const RECENT_IDS = ['park', 'zoo', 'store', 'play'];

export const UploadTab = (): JSX.Element => {
  const pictogramsById = usePictogramsById();
  return (
    <div className={styles.wrap}>
      <div className={styles.dropzone}>
        <div className={styles.iconCircle}>
          <UploadIcon size={28} />
        </div>
        <div className={styles.title}>Drop a photo or tap to upload</div>
        <div className={styles.hint}>
          Real photos of Liam&apos;s own cereal, shoes, or bed work best.
        </div>
        <div style={{ marginTop: 20 }}>
          <Button variant="primary" disabled>
            Choose file
          </Button>
        </div>
        <div className={styles.placeholder}>TODO(phase 3): wire to Supabase Storage upload.</div>
      </div>
      <div className={styles.recentHeading}>Recently uploaded</div>
      <div className={styles.recentRow}>
        {RECENT_IDS.map((id) => {
          const p = pictogramsById.get(id);
          if (!p) return null;
          return <PictoTile key={id} picto={p} size={100} />;
        })}
      </div>
    </div>
  );
};
