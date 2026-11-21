import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { pictogramsQueryKey } from '@/lib/queries/pictograms';
import { makeBoard, makeClient, makeWrapper } from '@/lib/queries/queries.test-utils';
import type { Board, Pictogram } from '@/types/domain';

const speakPictogramMock = vi.fn();
vi.mock('@/lib/voiceOut', () => ({ speakPictogram: speakPictogramMock }));

const { KidChoice } = await import('./KidChoice');

const park: Pictogram = { id: 'park-uuid', label: 'Park', style: 'photo' };
const zoo: Pictogram = { id: 'zoo-uuid', label: 'Zoo', style: 'photo' };

const board = makeBoard({ kind: 'choice', stepIds: [park.id, zoo.id] });

const renderBoard = (
  over: Partial<Board> = {},
  pictos: Pictogram[] = [park, zoo],
): ReturnType<typeof vi.fn> => {
  const client = makeClient();
  client.setQueryData(pictogramsQueryKey, pictos);
  const onExit = vi.fn();
  render(<KidChoice board={{ ...board, ...over }} onExit={onExit} />, {
    wrapper: makeWrapper(client),
  });
  return onExit;
};

afterEach(() => speakPictogramMock.mockReset());

describe('KidChoice', () => {
  it('renders one option per stepId', () => {
    renderBoard();
    expect(screen.getByText('Park')).toBeInTheDocument();
    expect(screen.getByText('Zoo')).toBeInTheDocument();
  });

  it('uses a generic "Pick one" title rather than baking in "place" (#237)', () => {
    renderBoard();
    expect(screen.getByText('Pick one')).toBeInTheDocument();
    expect(screen.queryByText(/Pick one place/)).not.toBeInTheDocument();
  });

  it('starts with no choice — a placeholder prompts to tap', () => {
    renderBoard();
    expect(screen.getByText(/Tap one to choose/)).toBeInTheDocument();
  });

  it('picking an option speaks it and reveals the confirm CTA', async () => {
    renderBoard();
    // Target the choice button by accessible name (marker letter + label),
    // not the inner label span — the inner span is overlaid by absolutely-
    // positioned media wrappers that confuse userEvent's pointer simulation.
    await userEvent.click(screen.getByRole('button', { name: /Park/i }));
    expect(speakPictogramMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: park.id }),
      'tts',
    );
    expect(screen.queryByText(/Tap one to choose/)).not.toBeInTheDocument();
    // Confirm CTA accessible name combines a CheckIcon (no name) with
    // split text nodes — anchor on the "Let's go to" prefix only.
    expect(screen.getByText(/Let.+s go to/)).toBeInTheDocument();
  });

  it('selects only the tapped slot when a board lists the same pictogram twice (#273)', async () => {
    // A choice board may legitimately repeat a pictogram. Selection must be
    // keyed by slot position, not pictogram id — otherwise tapping one tile
    // marks every identical tile as picked (and the React key collides).
    renderBoard({ stepIds: [park.id, park.id] });
    const first = screen.getByRole('button', { name: /A.*Park/i });
    const second = screen.getByRole('button', { name: /B.*Park/i });
    await userEvent.click(first);
    expect(first.className).toMatch(/choicePicked/);
    expect(second.className).not.toMatch(/choicePicked/);
  });

  it('tapping the confirm pill re-speaks the picked label (#231)', async () => {
    renderBoard();
    await userEvent.click(screen.getByRole('button', { name: /Park/i }));
    speakPictogramMock.mockClear();
    await userEvent.click(screen.getByRole('button', { name: /Hear Park again/i }));
    expect(speakPictogramMock).toHaveBeenCalledTimes(1);
    expect(speakPictogramMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: park.id }),
      'tts',
    );
  });

  it('hides per-tile labels when board.labelsVisible is false, keeping marker+label as the accessible name', () => {
    renderBoard({ labelsVisible: false });
    // Visible label span gone — `Park` text is no longer in the DOM.
    expect(screen.queryByText('Park')).not.toBeInTheDocument();
    expect(screen.queryByText('Zoo')).not.toBeInTheDocument();
    // Marker letter must still ride with the accessible name. A teacher saying
    // "tap A" needs the screen reader to announce both, not just the label.
    expect(screen.getByRole('button', { name: /A.*Park/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /B.*Zoo/i })).toBeInTheDocument();
  });

  it('still shows the picked CTA text when labels are hidden (per-tile labels only, not all text)', async () => {
    renderBoard({ labelsVisible: false });
    await userEvent.click(screen.getByRole('button', { name: /A.*Park/i }));
    expect(screen.getByText(/Let.+s go to Park/)).toBeInTheDocument();
  });

  it('exit button calls onExit', async () => {
    const onExit = renderBoard();
    await userEvent.click(screen.getByRole('button', { name: /Exit kid mode/i }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('shows a friendly empty-state when the board has zero options (#183)', () => {
    renderBoard({ stepIds: [] });
    expect(screen.getByRole('status')).toHaveTextContent(/grown-up/i);
    // The "Tap one to choose" prompt is meaningless with no options — make
    // sure we suppress it rather than stacking it under the empty-state.
    expect(screen.queryByText(/Tap one to choose/)).not.toBeInTheDocument();
  });

  it('shows the empty-state when every stepId references a missing pictogram', () => {
    // Realistic production case: parent deletes a pictogram from Library
    // while it's still referenced by a choice board.
    renderBoard({}, []);
    expect(screen.getByRole('status')).toHaveTextContent(/grown-up/i);
  });
});
