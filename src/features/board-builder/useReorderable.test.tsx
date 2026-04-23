import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Reorderable } from './useReorderable';

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
});
