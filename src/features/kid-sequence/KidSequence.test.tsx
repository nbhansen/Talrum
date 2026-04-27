import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSX, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { pictogramsQueryKey } from '@/lib/queries/pictograms';
import type { Board, Pictogram } from '@/types/domain';

const speakPictogramMock = vi.fn();
vi.mock('@/lib/voiceOut', () => ({ speakPictogram: speakPictogramMock }));

const { KidSequence } = await import('./KidSequence');

const apple: Pictogram = {
  id: 'apple-uuid',
  label: 'Apple',
  style: 'illus',
  glyph: 'apple',
  tint: 'oklch(88% 0.05 20)',
};
const cup: Pictogram = {
  id: 'cup-uuid',
  label: 'Drink',
  style: 'illus',
  glyph: 'cup',
  tint: 'oklch(88% 0.05 240)',
};

const board: Board = {
  id: 'board-uuid',
  ownerId: 'owner',
  kidId: 'kid',
  name: 'Morning',
  kind: 'sequence',
  labelsVisible: true,
  voiceMode: 'tts',
  stepIds: [apple.id, cup.id],
  kidReorderable: false,
  accent: 'peach',
  accentInk: 'peach-ink',
  updatedLabel: 'just now',
};

const Wrap = ({ children, qc }: { children: ReactNode; qc: QueryClient }): JSX.Element => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);

const makeClient = (): QueryClient => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(pictogramsQueryKey, [apple, cup]);
  return qc;
};

afterEach(() => speakPictogramMock.mockReset());

describe('KidSequence', () => {
  it('renders one tile per stepId, resolving against the pictogram cache', () => {
    const qc = makeClient();
    render(
      <Wrap qc={qc}>
        <KidSequence board={board} onExit={vi.fn()} />
      </Wrap>,
    );
    expect(screen.getByText('Apple')).toBeInTheDocument();
    expect(screen.getByText('Drink')).toBeInTheDocument();
  });

  it('tapping a tile speaks the pictogram with the board voice mode', async () => {
    const qc = makeClient();
    render(
      <Wrap qc={qc}>
        <KidSequence board={board} onExit={vi.fn()} />
      </Wrap>,
    );
    await userEvent.click(screen.getByText('Apple'));
    expect(speakPictogramMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: apple.id }),
      'tts',
    );
  });

  it('hides per-tile labels when board.labelsVisible is false, but keeps an accessible name', () => {
    const qc = makeClient();
    render(
      <Wrap qc={qc}>
        <KidSequence board={{ ...board, labelsVisible: false }} onExit={vi.fn()} />
      </Wrap>,
    );
    // Visible label span gone — the literal label text is no longer in the DOM.
    expect(screen.queryByText('Apple')).not.toBeInTheDocument();
    expect(screen.queryByText('Drink')).not.toBeInTheDocument();
    // The button's accessible name comes from the conditional aria-label.
    expect(screen.getByRole('button', { name: /Apple/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Drink/i })).toBeInTheDocument();
  });

  it('preserves the accessible name on the kidReorderable (dnd-kit) branch', () => {
    // The reorderable render path spreads dnd-kit's `attributes` and
    // `listeners` onto the same button. `aria-label` as an explicit attribute
    // (not a conditional spread) makes precedence over those spreads explicit.
    const qc = makeClient();
    render(
      <Wrap qc={qc}>
        <KidSequence
          board={{ ...board, labelsVisible: false, kidReorderable: true }}
          onExit={vi.fn()}
        />
      </Wrap>,
    );
    expect(screen.getByRole('button', { name: /Apple/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Drink/i })).toBeInTheDocument();
  });

  it('the exit button calls onExit', async () => {
    const qc = makeClient();
    const onExit = vi.fn();
    render(
      <Wrap qc={qc}>
        <KidSequence board={board} onExit={onExit} />
      </Wrap>,
    );
    await userEvent.click(screen.getByRole('button', { name: /Exit kid mode/i }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('drops missing pictograms (e.g. step references a deleted picto)', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(pictogramsQueryKey, [apple]); // cup missing
    render(
      <Wrap qc={qc}>
        <KidSequence board={board} onExit={vi.fn()} />
      </Wrap>,
    );
    expect(screen.getByText('Apple')).toBeInTheDocument();
    expect(screen.queryByText('Drink')).not.toBeInTheDocument();
  });
});
