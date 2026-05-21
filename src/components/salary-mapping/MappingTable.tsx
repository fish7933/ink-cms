import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pencil, Trash2, Ship as ShipIcon, Plus } from 'lucide-react';
import type { ShipSalaryAssignment } from '@/lib/salary-store';

interface MappingTableProps {
  assignments: ShipSalaryAssignment[];
  getShipName: (shipId: string) => string;
  getTemplateName: (templateId: string) => string;
  onEdit: (assignment: ShipSalaryAssignment) => void;
  onDelete: (assignment: ShipSalaryAssignment) => void;
  onAdd: () => void;
  searchTerm: string;
  canEdit?: boolean;
  canDelete?: boolean;
}

export default function MappingTable({
  assignments,
  getShipName,
  getTemplateName,
  onEdit,
  onDelete,
  onAdd,
  searchTerm,
  canEdit = true,
  canDelete = true,
}: MappingTableProps) {
  const showActions = canEdit || canDelete;

  if (assignments.length === 0) {
    return (
      <div className="text-center py-12">
        <ShipIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-500 mb-4">
          {searchTerm ? '검색 결과가 없습니다.' : '아직 매칭된 선박이 없습니다.'}
        </p>
        {!searchTerm && canEdit && (
          <Button onClick={onAdd} variant="outline" className="gap-2">
            <Plus className="w-4 h-4" />
            첫 매칭 추가하기
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>선박명</TableHead>
            <TableHead>급여 템플릿</TableHead>
            <TableHead>적용일</TableHead>
            {showActions && <TableHead className="text-right">작업</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {assignments.map((assignment) => (
            <TableRow key={assignment.id}>
              <TableCell className="font-medium">
                {getShipName(assignment.ship_id)}
              </TableCell>
              <TableCell>{getTemplateName(assignment.template_id)}</TableCell>
              <TableCell>
                {new Date(assignment.assigned_at).toLocaleDateString('ko-KR')}
              </TableCell>
              {showActions && (
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    {canEdit && (
                      <Button
                        onClick={() => onEdit(assignment)}
                        variant="ghost"
                        size="sm"
                        className="gap-2"
                      >
                        <Pencil className="w-4 h-4" />
                        수정
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        onClick={() => onDelete(assignment)}
                        variant="ghost"
                        size="sm"
                        className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                        삭제
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