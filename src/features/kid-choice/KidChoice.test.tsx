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
  accentInk: 'sky-ink',
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
});
