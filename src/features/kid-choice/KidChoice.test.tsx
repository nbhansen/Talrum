import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSX, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { pictogramsQueryKey } from '@/lib/queries/pictograms';
import type { Board, Pictogram } from '@/types/domain';

const speakPictogramMock = vi.fn();
vi.mock('@/lib/voiceOut', () => ({ speakPictogram: speakPictogramMock }));

const { KidChoice } = await import('./KidChoice');

const park: Pictogram = { id: 'park-uuid', label: 'Park', style: 'photo' };
const zoo: Pictogram = { id: 'zoo-uuid', label: 'Zoo', style: 'photo' };

const board: Board = {
  id: 'board-uuid',
  ownerId: 'owner',
  kidId: 'kid',
  name: 'Saturday',
  kind: 'choice',
  labelsVisible: true,
  voiceMode: 'tts',
  stepIds: [park.id, zoo.id],
  kidReorderable: false,
  accent: 'sky',
  updatedLabel: 'just now',
};

const Wrap = ({ children, qc }: { children: ReactNode; qc: QueryClient }): JSX.Element => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);

const makeClient = (): QueryClient => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(pictogramsQueryKey, [park, zoo]);
  return qc;
};

afterEach(() => speakPictogramMock.mockReset());

describe('KidChoice', () => {
  it('renders one option per stepId', () => {
    const qc = makeClient();
    render(
      <Wrap qc={qc}>
        <KidChoice board={board} onExit={vi.fn()} />
      </Wrap>,
    );
    expect(screen.getByText('Park')).toBeInTheDocument();
    expect(screen.getByText('Zoo')).toBeInTheDocument();
  });

  it('uses a generic "Pick one" title rather than baking in "place" (#237)', () => {
    const qc = makeClient();
    render(
      <Wrap qc={qc}>
        <KidChoice board={board} onExit={vi.fn()} />
      </Wrap>,
    );
    expect(screen.getByText('Pick one')).toBeInTheDocument();
    expect(screen.queryByText(/Pick one place/)).not.toBeInTheDocument();
  });

  it('starts with no choice — a placeholder prompts to tap', () => {
    const qc = makeClient();
    render(
      <Wrap qc={qc}>
        <KidChoice board={board} onExit={vi.fn()} />
      </Wrap>,
    );
    expect(screen.getByText(/Tap one to choose/)).toBeInTheDocument();
  });

  it('picking an option speaks it and reveals the confirm CTA', async () => {
    const qc = makeClient();
    render(
      <Wrap qc={qc}>
        <KidChoice board={board} onExit={vi.fn()} />
      </Wrap>,
    );
    // By accessible name, not the inner label span: the span is overlaid by
    // absolutely-positioned media that confuses userEvent's pointer.
    await userEvent.click(screen.getByRole('button', { name: /Park/i }));
    expect(speakPictogramMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: park.id }),
      'tts',
    );
    expect(screen.queryByText(/Tap one to choose/)).not.toBeInTheDocument();
    // The name combines an unnamed icon with split text nodes, so anchor on
    // the prefix only.
    expect(screen.getByText(/Let.+s go to/)).toBeInTheDocument();
  });

  it('selects only the tapped slot when a board lists the same pictogram twice (#273)', async () => {
    // A choice board may legitimately repeat a pictogram (#273).
    const qc = makeClient();
    render(
      <Wrap qc={qc}>
        <KidChoice board={{ ...board, stepIds: [park.id, park.id] }} onExit={vi.fn()} />
      </Wrap>,
    );
    const first = screen.getByRole('button', { name: /A.*Park/i });
    const second = screen.getByRole('button', { name: /B.*Park/i });
    await userEvent.click(first);
    expect(first.className).toMatch(/choicePicked/);
    expect(second.className).not.toMatch(/choicePicked/);
  });

  it('tapping the confirm pill re-speaks the picked label (#231)', async () => {
    const qc = makeClient();
    render(
      <Wrap qc={qc}>
        <KidChoice board={board} onExit={vi.fn()} />
      </Wrap>,
    );
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
    const qc = makeClient();
    render(
      <Wrap qc={qc}>
        <KidChoice board={{ ...board, labelsVisible: false }} onExit={vi.fn()} />
      </Wrap>,
    );
    expect(screen.queryByText('Park')).not.toBeInTheDocument();
    expect(screen.queryByText('Zoo')).not.toBeInTheDocument();
    // A teacher saying "tap A" needs the reader to announce the marker too.
    expect(screen.getByRole('button', { name: /A.*Park/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /B.*Zoo/i })).toBeInTheDocument();
  });

  it('still shows the picked CTA text when labels are hidden (per-tile labels only, not all text)', async () => {
    const qc = makeClient();
    render(
      <Wrap qc={qc}>
        <KidChoice board={{ ...board, labelsVisible: false }} onExit={vi.fn()} />
      </Wrap>,
    );
    await userEvent.click(screen.getByRole('button', { name: /A.*Park/i }));
    expect(screen.getByText(/Let.+s go to Park/)).toBeInTheDocument();
  });

  it('exit button calls onExit', async () => {
    const qc = makeClient();
    const onExit = vi.fn();
    render(
      <Wrap qc={qc}>
        <KidChoice board={board} onExit={onExit} />
      </Wrap>,
    );
    await userEvent.click(screen.getByRole('button', { name: /Exit kid mode/i }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('shows a friendly empty-state when the board has zero options (#183)', () => {
    const qc = makeClient();
    render(
      <Wrap qc={qc}>
        <KidChoice board={{ ...board, stepIds: [] }} onExit={vi.fn()} />
      </Wrap>,
    );
    expect(screen.getByRole('status')).toHaveTextContent(/grown-up/i);
    // The prompt is meaningless with no options to tap.
    expect(screen.queryByText(/Tap one to choose/)).not.toBeInTheDocument();
  });

  it('shows the empty-state when every stepId references a missing pictogram', () => {
    // The parent deleted a pictogram a choice board still references.
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(pictogramsQueryKey, []); // both park + zoo missing
    render(
      <Wrap qc={qc}>
        <KidChoice board={board} onExit={vi.fn()} />
      </Wrap>,
    );
    expect(screen.getByRole('status')).toHaveTextContent(/grown-up/i);
  });
});
