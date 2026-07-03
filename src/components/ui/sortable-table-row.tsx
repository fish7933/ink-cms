import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { TableCell, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

interface SortableTableRowProps {
  id: string;
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
}

/**
 * Drag-handle table row for @dnd-kit lists. Renders a grip-handle cell followed by `children`.
 * Wrap rows with a SortableContext (items = the list's ids) and a DndContext higher up the tree.
 */
export function SortableTableRow({ id, onClick, className, children }: SortableTableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <TableRow ref={setNodeRef} style={style} className={cn('cursor-pointer hover:bg-gray-50', className)} onClick={onClick}>
      <TableCell className="w-12" onClick={e => e.stopPropagation()}>
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing touch-none">
          <GripVertical className="w-4 h-4 text-gray-400" />
        </div>
      </TableCell>
      {children}
    </TableRow>
  );
}
