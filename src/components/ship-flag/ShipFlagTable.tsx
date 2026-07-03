import { TableCell, TableHead, TableHeader, TableRow, Table, TableBody } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Edit, Trash2 } from 'lucide-react';
import type { ShipFlag } from '@/types/ship-flag';
import { SortableTableRow } from '@/components/ui/sortable-table-row';
import { useDragReorder } from '@/hooks/useDragReorder';
import { updateShipFlag } from '@/services/ship-flag.service';
import { DndContext } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';

interface ShipFlagTableProps {
  flags: ShipFlag[];
  onFlagsChange: (flags: ShipFlag[]) => void;
  onReorderError: () => void;
  onEdit: (flag: ShipFlag) => void;
  onDelete: (id: string) => void;
  canEdit: boolean;
  canDelete: boolean;
}

export default function ShipFlagTable({ flags, onFlagsChange, onReorderError, onEdit, onDelete, canEdit, canDelete }: ShipFlagTableProps) {
  const { sensors, collisionDetection, handleDragEnd } = useDragReorder(
    flags,
    onFlagsChange,
    (id, display_order) => updateShipFlag(id, { display_order }),
    onReorderError
  );

  if (flags.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 text-sm">
        등록된 선적국이 없습니다.
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12"></TableHead>
            <TableHead className="w-24">코드</TableHead>
            <TableHead>한글명</TableHead>
            <TableHead>영문명</TableHead>
            <TableHead className="w-24 text-center">표시순서</TableHead>
            <TableHead className="w-24 text-center">상태</TableHead>
            {(canEdit || canDelete) && <TableHead className="w-32 text-right">작업</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragEnd={handleDragEnd}>
            <SortableContext items={flags.map(f => f.id)} strategy={verticalListSortingStrategy}>
              {flags.map((flag) => (
                <SortableTableRow key={flag.id} id={flag.id}>
                  <TableCell className="font-mono font-semibold">{flag.code}</TableCell>
                  <TableCell>{flag.name_ko}</TableCell>
                  <TableCell>{flag.name_en}</TableCell>
                  <TableCell className="text-center">{flag.display_order}</TableCell>
                  <TableCell className="text-center">
                    {flag.is_active ? (
                      <Badge variant="default" className="bg-green-600">활성</Badge>
                    ) : (
                      <Badge variant="secondary">비활성</Badge>
                    )}
                  </TableCell>
                  {(canEdit || canDelete) && (
                    <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex gap-2 justify-end">
                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onEdit(flag)}
                            className="h-8 w-8 p-0"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onDelete(flag.id)}
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  )}
                </SortableTableRow>
              ))}
            </SortableContext>
          </DndContext>
        </TableBody>
      </Table>
    </div>
  );
}
