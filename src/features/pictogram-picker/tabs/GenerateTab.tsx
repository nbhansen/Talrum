import type { JSX } from 'react';

import { usePictogramsById } from '@/lib/queries/pictograms';
import type { Pictogram } from '@/types/domain';
import { Button } from '@/ui/Button/Button';
import { Chip } from '@/ui/Chip/Chip';
import { SparkleIcon } from '@/ui/icons';
import { PictoTile } from '@/ui/PictoTile/PictoTile';

import styles from './GenerateTab.module.css';

const RESULT_IDS = ['breakfast', 'apple', 'cup', 'bath'];

export const GenerateTab = (): JSX.Element => {
  const pictogramsById = usePictogramsById();
  const results: Pictogram[] = RESULT_IDS.map((id) => pictogramsById.get(id)).filter(
    (p): p is Pictogram => Boolean(p),
  );
  return (
    <div className={styles.wrap}>
      <div className={styles.form}>
        <label className={styles.label}>Describe the pictogram</label>
        <textarea
          className={styles.textarea}
          defaultValue="A bowl of oatmeal with berries on top"
          rows={2}
        />
        <div className={styles.toolbar}>
          <div className={styles.toolbarLabel}>Style:</div>
          <Chip active>Flat illustrated</Chip>
          <Chip>Line art</Chip>
          <Chip>Soft watercolor</Chip>
          <div className={styles.spacer} />
          <Button variant="primary" icon={<SparkleIcon />} disabled>
            Generate 4
          </Button>
        </div>
      </div>
      <div className={styles.placeholder}>
        TODO(phase 3): call Supabase Edge Function for generation.
      </div>
      <div className={styles.results}>
        {results.map((p, i) => (
          <div key={p.id} className={styles.result}>
            <PictoTile picto={p} size={110} showLabel={false} />
            <button
              type="button"
              className={`${styles.useBtn} ${i === 0 ? styles.useBtnPrimary : ''}`}
            >
              {i === 0 ? '✓ Use this' : 'Use'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
