import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Edit, Trash2 } from 'lucide-react';
import type { ShipFlag } from '@/types/ship-flag';

interface ShipFlagTableProps {
  flags: ShipFlag[];
  onEdit: (flag: ShipFlag) => void;
  onDelete: (id: string) => void;
  canEdit: boolean;
  canDelete: boolean;
}

export default function ShipFlagTable({ flags, onEdit, onDelete, canEdit, canDelete }: ShipFlagTableProps) {
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
            <TableHead className="w-24">코드</TableHead>
            <TableHead>한글명</TableHead>
            <TableHead>영문명</TableHead>
            <TableHead className="w-24 text-center">표시순서</TableHead>
            <TableHead className="w-24 text-center">상태</TableHead>
            {(canEdit || canDelete) && <TableHead className="w-32 text-right">작업</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {flags.map((flag) => (
            <TableRow key={flag.id}>
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
                <TableCell className="text-right">
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
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}