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
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
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
  /** Key suffix lets the same id appear twice (e.g. duplicate picto in steps). */
  keyFor?: (item: T, index: number) => string;
}

/**
 * Pointer-based reorderable list. Replaces the prototype's HTML5 drag-and-drop,
 * which doesn't work on iPad touch. Uses @dnd-kit under the hood but keeps the
 * API tight — caller only sees items, onReorder, and DragBindings.
 */
export const Reorderable = <T extends Identified>({
  items,
  onReorder,
  renderItem,
  keyFor,
}: ReorderableProps<T>): JSX.Element => {
  const keys = items.map((item, i) => (keyFor ? keyFor(item, i) : item.id));
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

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
      <SortableContext items={keys} strategy={verticalListSortingStrategy}>
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
