import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Reorderable } from './Reorderable';

interface Item {
  id: string;
  label: string;
}

describe('Reorderable', () => {
  it('renders items in the supplied order', () => {
    const items: Item[] = [
      { id: 'a', label: 'Alpha' },
      { id: 'b', label: 'Bravo' },
      { id: 'c', label: 'Charlie' },
    ];
    render(
      <Reorderable
        items={items}
        onReorder={() => undefined}
        renderItem={(item, _i, drag) => (
          <div key={item.id} ref={drag.setNodeRef} data-testid={`item-${item.id}`}>
            {item.label}
          </div>
        )}
      />,
    );
    expect(screen.getByTestId('item-a')).toHaveTextContent('Alpha');
    expect(screen.getByTestId('item-b')).toHaveTextContent('Bravo');
    expect(screen.getByTestId('item-c')).toHaveTextContent('Charlie');
  });

  it('reorders an item with the keyboard (#681)', async () => {
    // jsdom has no layout; give each item a row so dnd-kit can find a target.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      const row = ['a', 'b', 'c'].indexOf(this.getAttribute('data-testid')?.slice(5) ?? '');
      return new DOMRect(0, Math.max(row, 0) * 50, 100, 40);
    });
    const onReorder = vi.fn();
    const user = userEvent.setup();
    render(
      <Reorderable
        items={[
          { id: 'a', label: 'Alpha' },
          { id: 'b', label: 'Bravo' },
          { id: 'c', label: 'Charlie' },
        ]}
        onReorder={onReorder}
        renderItem={(item, _i, drag) => (
          <div
            key={item.id}
            ref={drag.setNodeRef}
            data-testid={`item-${item.id}`}
            {...drag.attributes}
            {...drag.listeners}
          >
            {item.label}
          </div>
        )}
      />,
    );

    screen.getByTestId('item-a').focus();
    await user.keyboard('[Space]');
    await user.keyboard('[ArrowDown]');
    await user.keyboard('[Space]');

    await waitFor(() => expect(onReorder).toHaveBeenCalledWith(['b', 'a', 'c']));
  });

  it('leaves Space on a button inside an item to that button', async () => {
    const onRemove = vi.fn();
    const user = userEvent.setup();
    render(
      <Reorderable
        items={[{ id: 'a', label: 'Alpha' }]}
        handle
        onReorder={() => undefined}
        renderItem={(item, _i, drag) => (
          <div key={item.id} ref={drag.setNodeRef} {...drag.listeners}>
            <span ref={drag.setHandleRef} {...drag.attributes} aria-label="Reorder" />
            <button type="button" onClick={onRemove}>
              Remove {item.label}
            </button>
          </div>
        )}
      />,
    );

    screen.getByText('Remove Alpha').focus();
    await user.keyboard('[Space]');

    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
