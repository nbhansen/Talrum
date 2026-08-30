import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { CSSProperties, JSX, ReactNode } from 'react';

interface Identified {
  id: string;
}

export interface DragBindings {
  setNodeRef: (node: HTMLElement | null) => void;
  style: CSSProperties;
  attributes: ReturnType<typeof useSortable>['attributes'];
  listeners: ReturnType<typeof useSortable>['listeners'];
  isDragging: boolean;
}

interface ReorderableProps<T extends Identified> {
  items: readonly T[];
  onReorder: (nextIds: string[]) => void;
  renderItem: (item: T, index: number, drag: DragBindings) => ReactNode;
}

/**
 * Pointer-based, because HTML5 drag-and-drop does not work on iPad touch.
 * @dnd-kit stays behind the API: callers see items, onReorder and DragBindings.
 */
export const Reorderable = <T extends Identified>({
  items,
  onReorder,
  renderItem,
}: ReorderableProps<T>): JSX.Element => {
  const keys = items.map((item) => item.id);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = keys.indexOf(String(active.id));
    const to = keys.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const reordered = arrayMove([...items], from, to);
    onReorder(reordered.map((item) => item.id));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={keys} strategy={horizontalListSortingStrategy}>
        {items.map((item, i) => (
          <SortableItem key={keys[i]} itemKey={keys[i] ?? item.id}>
            {(drag) => renderItem(item, i, drag)}
          </SortableItem>
        ))}
      </SortableContext>
    </DndContext>
  );
};

interface SortableItemProps {
  itemKey: string;
  children: (drag: DragBindings) => ReactNode;
}

const SortableItem = ({ itemKey, children }: SortableItemProps): JSX.Element => {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: itemKey,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return <>{children({ setNodeRef, style, attributes, listeners, isDragging })}</>;
};
