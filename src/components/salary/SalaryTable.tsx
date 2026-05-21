import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pencil, DollarSign, Trash2 } from 'lucide-react';
import type { SalaryTable as SalaryTableType, Ship } from '@/types/models';

interface SalaryTableProps {
  salaryTables: SalaryTableType[];
  ships: Ship[];
  onEdit: (salary: SalaryTableType) => void;
  canEdit?: boolean;
  canDelete?: boolean;
}

export default function SalaryTable({ salaryTables, ships, onEdit, canEdit = true, canDelete = true }: SalaryTableProps) {
  const getShipName = (shipId: string | null) => {
    if (!shipId) return 'Unknown';
    return ships.find(s => s.id === shipId)?.name || 'Unknown';
  };

  const showActions = canEdit || canDelete;

  if (salaryTables.length === 0) {
    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>선박</TableHead>
              <TableHead>직급</TableHead>
              <TableHead>승선 급여</TableHead>
              <TableHead>휴가 급여</TableHead>
              <TableHead>특별 수당</TableHead>
              {showActions && <TableHead className="text-right">작업</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                등록된 급여 정보가 없습니다
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>선박</TableHead>
            <TableHead>직급</TableHead>
            <TableHead>승선 급여</TableHead>
            <TableHead>휴가 급여</TableHead>
            <TableHead>특별 수당</TableHead>
            {showActions && <TableHead className="text-right">작업</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {salaryTables.map((salary) => (
            <TableRow key={salary.id}>
              <TableCell className="font-medium">{getShipName(salary.ship_id)}</TableCell>
              <TableCell className="font-bold">{salary.rank}</TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <DollarSign className="w-4 h-4 text-gray-500" />
                  {salary.onboard_salary.toLocaleString()} {salary.currency}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <DollarSign className="w-4 h-4 text-gray-500" />
                  {salary.leave_salary.toLocaleString()} {salary.currency}
                </div>
              </TableCell>
              <TableCell>
                {salary.special_allowance ? (
                  <div className="flex items-center gap-1">
                    <DollarSign className="w-4 h-4 text-gray-500" />
                    {salary.special_allowance.toLocaleString()} {salary.currency}
                  </div>
                ) : '-'}
              </TableCell>
              {showActions && (
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    {canEdit && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onEdit(salary)}
                        className="gap-2"
                      >
                        <Pencil className="w-4 h-4" />
                        수정
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        size="sm"
                        variant="ghost"
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