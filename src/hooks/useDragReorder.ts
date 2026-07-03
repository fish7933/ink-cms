import { useState } from 'react';
import {
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';

interface OrderedItem {
  id: string;
  display_order: number;
}

/**
 * Drag-and-drop reordering for a flat list of items with a `display_order` field.
 * Reorders optimistically, persists the new display_order for every item via `persist`,
 * and calls `onError` (typically a re-fetch) if persisting fails.
 */
export function useDragReorder<T extends OrderedItem>(
  items: T[],
  setItems: (items: T[]) => void,
  persist: (id: string, display_order: number) => Promise<unknown>,
  onError?: () => void
) {
  const [isSaving, setIsSaving] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex(i => i.id === active.id);
    const newIndex = items.findIndex(i => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(items, oldIndex, newIndex).map((item, i) => ({ ...item, display_order: i + 1 }));
    setItems(reordered);

    setIsSaving(true);
    try {
      await Promise.all(reordered.map(item => persist(item.id, item.display_order)));
    } catch {
      onError?.();
    } finally {
      setIsSaving(false);
    }
  };

  return { sensors, collisionDetection: closestCenter, handleDragEnd, isSaving };
}
