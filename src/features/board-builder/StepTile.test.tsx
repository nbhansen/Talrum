import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { Pictogram } from '@/types/domain';
import { Reorderable } from '@/ui/Reorderable/Reorderable';

import { StepTile } from './StepTile';

const pictos: Pictogram[] = [
  { id: 'a', label: 'Apple', style: 'illus', glyph: 'apple', tint: 'oklch(90% 0.05 140)' },
  { id: 'b', label: 'Bed', style: 'illus', glyph: 'bed', tint: 'oklch(90% 0.05 240)' },
];

const renderTiles = (onReorder = vi.fn(), onRemove = vi.fn()): void => {
  render(
    <Reorderable
      items={pictos}
      handle
      onReorder={onReorder}
      renderItem={(picto, index, drag) => (
        <StepTile
          key={picto.id}
          picto={picto}
          index={index}
          kind="sequence"
          labelsVisible
          onRemove={onRemove}
          onEdit={() => undefined}
          drag={drag}
        />
      )}
    />,
  );
};

describe('StepTile', () => {
  it('reorders with the keyboard from the handle (#728)', async () => {
    // jsdom has no layout; give each tile a row so dnd-kit can find a target.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      const row = this.textContent?.includes('Bed') ? 1 : 0;
      return new DOMRect(0, row * 200, 100, 150);
    });
    const onReorder = vi.fn();
    const user = userEvent.setup();
    renderTiles(onReorder);

    screen.getByRole('button', { name: 'Reorder Apple' }).focus();
    await user.keyboard('[Space]');
    await user.keyboard('[ArrowDown]');
    await user.keyboard('[Space]');

    await waitFor(() => expect(onReorder).toHaveBeenCalledWith(['b', 'a']));
  });

  it('leaves Space on the Remove button to that button', async () => {
    const onRemove = vi.fn();
    const user = userEvent.setup();
    renderTiles(vi.fn(), onRemove);

    screen.getByRole('button', { name: 'Remove Apple' }).focus();
    await user.keyboard('[Space]');

    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
