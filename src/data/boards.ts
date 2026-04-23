import type { Board } from '@/types/domain';

const OWNER = 'seed-owner';
const KID = 'liam';

/**
 * Four seed boards — ported from the prototype's ParentHome. In Phase 2
 * these become the first rows a newly-signed-up user sees, optionally
 * dismissed via "skip seed data" on the auth screen.
 */
export const SEED_BOARDS: readonly Board[] = [
  {
    id: 'morning',
    ownerId: OWNER,
    kidId: KID,
    name: 'Morning routine',
    kind: 'sequence',
    labelsVisible: true,
    voiceMode: 'tts',
    stepIds: ['wakeup', 'brush', 'dress', 'breakfast', 'bag', 'car'],
    accent: 'peach',
    accentInk: 'peach-ink',
    updatedLabel: 'Edited 2h ago',
  },
  {
    id: 'afterschool',
    ownerId: OWNER,
    kidId: KID,
    name: 'After school',
    kind: 'sequence',
    labelsVisible: true,
    voiceMode: 'tts',
    stepIds: ['bag', 'apple', 'book', 'bath'],
    accent: 'sage',
    accentInk: 'sage-ink',
    updatedLabel: 'Edited yesterday',
  },
  {
    id: 'weekend',
    ownerId: OWNER,
    kidId: KID,
    name: 'Saturday — where to?',
    kind: 'choice',
    labelsVisible: true,
    voiceMode: 'tts',
    stepIds: ['park', 'store', 'zoo'],
    accent: 'sky',
    accentInk: 'sky-ink',
    updatedLabel: 'Edited Sun',
  },
  {
    id: 'bedtime',
    ownerId: OWNER,
    kidId: KID,
    name: 'Bedtime',
    kind: 'sequence',
    labelsVisible: true,
    voiceMode: 'tts',
    stepIds: ['bath', 'book', 'cup', 'bed'],
    accent: 'lavender',
    accentInk: 'lavender-ink',
    updatedLabel: '3 days ago',
  },
];

export const getBoard = (id: string): Board => {
  const board = SEED_BOARDS.find((b) => b.id === id);
  if (!board) throw new Error(`Unknown board id: ${id}`);
  return board;
};
