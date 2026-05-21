import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Pencil, Trash2, Eye } from 'lucide-react';
import type { CrewMember } from '@/types/models';

interface CrewTableProps {
  crewMembers: CrewMember[];
  onEdit: (crew: CrewMember) => void;
  onDelete: (id: string) => void;
  onViewDetails: (crew: CrewMember) => void;
  canEdit?: boolean;
  canDelete?: boolean;
}

export default function CrewTable({ 
  crewMembers, 
  onEdit, 
  onDelete,
  onViewDetails,
  canEdit = true,
  canDelete = true
}: CrewTableProps) {
  const showActions = canEdit || canDelete;

  if (crewMembers.length === 0) {
    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>이름</TableHead>
              <TableHead>직급</TableHead>
              <TableHead>국적</TableHead>
              <TableHead>생년월일</TableHead>
              <TableHead>연락처</TableHead>
              <TableHead className="text-right">작업</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                등록된 선원이 없습니다
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
            <TableHead>이름</TableHead>
            <TableHead>직급</TableHead>
            <TableHead>국적</TableHead>
            <TableHead>생년월일</TableHead>
            <TableHead>연락처</TableHead>
            <TableHead className="text-right">작업</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {crewMembers.map((crew) => (
            <TableRow key={crew.id}>
              <TableCell className="font-medium">{crew.name}</TableCell>
              <TableCell>
                <Badge variant="outline">{crew.rank}</Badge>
              </TableCell>
              <TableCell>{crew.nationality}</TableCell>
              <TableCell>{crew.date_of_birth}</TableCell>
              <TableCell>
                <div className="text-sm">
                  <div>{crew.email}</div>
                  <div className="text-gray-500">{crew.phone}</div>
                </div>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onViewDetails(crew)}
                    className="gap-2"
                  >
                    <Eye className="w-4 h-4" />
                    상세
                  </Button>
                  {canEdit && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onEdit(crew)}
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
                      onClick={() => onDelete(crew.id)}
                      className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                      삭제
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}