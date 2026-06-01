import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Eye, RefreshCw } from 'lucide-react';
import type { CrewWithDetails } from '@/services/crew.service';
import CrewStatusBadge from './CrewStatusBadge';

interface CrewStatusTableProps {
  crew: CrewWithDetails[];
  selectedCrewIds: string[];
  onSelectionChange: (crewId: string, checked: boolean) => void;
  onSelectAll: (checked: boolean) => void;
  onView: (crew: CrewWithDetails) => void;
  onEdit: (crew: CrewWithDetails) => void;
  onChangeStatus: (crew: CrewWithDetails) => void;
}

const deptColor = (dept: string) => {
  if (dept === 'deck') return 'bg-blue-100 text-blue-700 border-blue-300';
  if (dept === 'engine') return 'bg-green-100 text-green-700 border-green-300';
  if (dept === 'catering') return 'bg-orange-100 text-orange-700 border-orange-300';
  return 'bg-gray-100 text-gray-700 border-gray-300';
};

export function CrewStatusTable({
  crew,
  selectedCrewIds,
  onSelectionChange,
  onSelectAll,
  onView,
  onChangeStatus,
}: CrewStatusTableProps) {
  const allSelected = crew.length > 0 && selectedCrewIds.length === crew.length;
  const someSelected = selectedCrewIds.length > 0 && selectedCrewIds.length < crew.length;

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50">
            <TableHead className="w-10">
              <Checkbox
                checked={allSelected}
                onCheckedChange={onSelectAll}
                className={someSelected ? 'data-[state=checked]:bg-blue-600' : ''}
              />
            </TableHead>
            <TableHead className="text-xs">이름</TableHead>
            <TableHead className="text-xs">직급</TableHead>
            <TableHead className="text-xs">국적</TableHead>
            <TableHead className="text-xs">생년월일 / 나이</TableHead>
            <TableHead className="text-xs">매닝사</TableHead>
            <TableHead className="text-xs">선박</TableHead>
            <TableHead className="text-xs">상태</TableHead>
            <TableHead className="text-xs">구분</TableHead>
            <TableHead className="text-right text-xs w-20">작업</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {crew.length === 0 ? (
            <TableRow>
              <TableCell colSpan={10} className="text-center text-muted-foreground py-10 text-sm">
                등록된 선원이 없습니다
              </TableCell>
            </TableRow>
          ) : (
            crew.map(member => (
              <TableRow
                key={member.id}
                className="hover:bg-muted/50 cursor-pointer"
                onClick={() => onView(member)}
              >
                <TableCell onClick={e => e.stopPropagation()}>
                  <Checkbox
                    checked={selectedCrewIds.includes(member.id)}
                    onCheckedChange={c => onSelectionChange(member.id, c as boolean)}
                  />
                </TableCell>
                <TableCell className="font-medium text-sm py-2">
                  {member.name}
                </TableCell>
                <TableCell className="py-2">
                  <Badge variant="outline" className={`text-xs ${deptColor(member.department || '')}`}>
                    {member.rank_code || '-'}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm py-2 text-muted-foreground">
                  {member.nationality || '-'}
                </TableCell>
                <TableCell className="py-2">
                  {member.date_of_birth ? (
                    <div className="text-xs">
                      <div>{member.date_of_birth}</div>
                      {member.age && <div className="text-muted-foreground">({member.age}세)</div>}
                    </div>
                  ) : <span className="text-xs text-muted-foreground">-</span>}
                </TableCell>
                <TableCell className="text-xs py-2 text-muted-foreground max-w-[100px] truncate">
                  {member.manning_agency_name || '-'}
                </TableCell>
                <TableCell className="py-2">
                  {member.ship_name ? (
                    <div className="text-xs">
                      <div className="font-medium">{member.ship_name}</div>
                      {member.owner_name && <div className="text-muted-foreground">{member.owner_name}</div>}
                    </div>
                  ) : <span className="text-xs text-muted-foreground">미배정</span>}
                </TableCell>
                <TableCell className="py-2">
                  <CrewStatusBadge status={member.current_status} />
                </TableCell>
                <TableCell className="py-2">
                  <Badge
                    variant={member.rank_category === 'officer' ? 'default' : 'secondary'}
                    className="text-xs"
                  >
                    {member.rank_category === 'officer' ? '사관' : '부원'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right py-2" onClick={e => e.stopPropagation()}>
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onView(member)}
                      title="상세보기 / 수정"
                      className="h-7 w-7 p-0"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onChangeStatus(member)}
                      title="상태변경"
                      className="h-7 w-7 p-0"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export default CrewStatusTable;