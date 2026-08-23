import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSX, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { pictogramsQueryKey } from '@/lib/queries/pictograms';
import { LONG_PRESS_MS } from '@/lib/useLongPress';
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

  it('flashes only the tapped slot when a step repeats the same pictogram (#273)', async () => {
    // "jump, jump, jump" is a valid sequence. The speaking flash must track
    // the tapped slot, not the pictogram id — an id-keyed flash lights up
    // every identical tile at once.
    const qc = makeClient();
    render(
      <Wrap qc={qc}>
        <KidSequence board={{ ...board, stepIds: [apple.id, apple.id] }} onExit={vi.fn()} />
      </Wrap>,
    );
    const [first, second] = screen.getAllByRole('button', { name: /Apple/i });
    if (!first || !second) throw new Error('expected two Apple tiles');
    await userEvent.click(first);
    expect(first.className).toMatch(/tileActive/);
    expect(second.className).not.toMatch(/tileActive/);
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

  it('shows a friendly empty-state when the board has zero steps (#183)', () => {
    const qc = makeClient();
    render(
      <Wrap qc={qc}>
        <KidSequence board={{ ...board, stepIds: [] }} onExit={vi.fn()} />
      </Wrap>,
    );
    expect(screen.getByRole('status')).toHaveTextContent(/grown-up/i);
  });

  it('shows the empty-state when every stepId references a missing pictogram', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(pictogramsQueryKey, []); // both apple + cup missing
    render(
      <Wrap qc={qc}>
        <KidSequence board={board} onExit={vi.fn()} />
      </Wrap>,
    );
    expect(screen.getByRole('status')).toHaveTextContent(/grown-up/i);
  });

  describe('long-press marks a step done (#519)', () => {
    const hold = (el: HTMLElement): void => {
      fireEvent.pointerDown(el, { isPrimary: true, button: 0, clientX: 5, clientY: 5 });
      act(() => {
        vi.advanceTimersByTime(LONG_PRESS_MS);
      });
      fireEvent.pointerUp(el);
      fireEvent.click(el);
    };

    const renderBoard = (overrides: Partial<Board> = {}): void => {
      render(
        <Wrap qc={makeClient()}>
          <KidSequence board={{ ...board, ...overrides }} onExit={vi.fn()} />
        </Wrap>,
      );
    };

    afterEach(() => {
      vi.useRealTimers();
    });

    it('tapping a tile speaks it and does not mark it done', () => {
      vi.useFakeTimers();
      renderBoard();
      const apple = screen.getByRole('button', { name: /Apple/i });
      fireEvent.pointerDown(apple, { isPrimary: true, button: 0, clientX: 5, clientY: 5 });
      fireEvent.pointerUp(apple);
      fireEvent.click(apple);
      expect(speakPictogramMock).toHaveBeenCalledTimes(1);
      expect(apple).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByText('Step 1 of 2')).toBeInTheDocument();
    });

    it('long-pressing the current step marks it done, advances current, and does not speak', () => {
      vi.useFakeTimers();
      renderBoard();
      const apple = screen.getByRole('button', { name: /Apple/i });
      const drink = screen.getByRole('button', { name: /Drink/i });
      expect(apple.className).toMatch(/tileCurrent/);

      hold(apple);

      expect(speakPictogramMock).not.toHaveBeenCalled();
      expect(apple).toHaveAttribute('aria-pressed', 'true');
      expect(apple.className).toMatch(/tileDone/);
      expect(drink.className).toMatch(/tileCurrent/);
      expect(screen.getByText('Step 2 of 2')).toBeInTheDocument();
    });

    it('long-pressing a done step un-marks it and it becomes current again', () => {
      vi.useFakeTimers();
      renderBoard();
      const apple = screen.getByRole('button', { name: /Apple/i });
      hold(apple);
      hold(apple);
      expect(apple).toHaveAttribute('aria-pressed', 'false');
      expect(apple.className).toMatch(/tileCurrent/);
      expect(screen.getByText('Step 1 of 2')).toBeInTheDocument();
    });

    it('shows the all-done banner once every step is done', () => {
      vi.useFakeTimers();
      renderBoard();
      hold(screen.getByRole('button', { name: /Apple/i }));
      hold(screen.getByRole('button', { name: /Drink/i }));
      expect(screen.getByText('All done!')).toBeInTheDocument();
      expect(screen.queryByText(/Step \d of/)).not.toBeInTheDocument();
    });

    it('long-press still marks done on the kidReorderable branch and the tile keeps its sortable role', () => {
      vi.useFakeTimers();
      renderBoard({ kidReorderable: true });
      const apple = screen.getByRole('button', { name: /Apple/i });
      expect(apple).toHaveAttribute('aria-roledescription', 'sortable');
      hold(apple);
      expect(apple).toHaveAttribute('aria-pressed', 'true');
      expect(apple).toHaveAttribute('aria-roledescription', 'sortable');
    });
  });
});
