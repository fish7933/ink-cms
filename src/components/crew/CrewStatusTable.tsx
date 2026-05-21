import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Edit, RefreshCw } from 'lucide-react';
import type { CrewWithDetails } from '@/services/crew.service';
import CrewStatusBadge from './CrewStatusBadge';

interface CrewStatusTableProps {
  crew: CrewWithDetails[];
  selectedCrewIds: string[];
  onSelectionChange: (crewId: string, checked: boolean) => void;
  onSelectAll: (checked: boolean) => void;
  onEdit: (crew: CrewWithDetails) => void;
  onChangeStatus: (crew: CrewWithDetails) => void;
}

export function CrewStatusTable({ 
  crew, 
  selectedCrewIds,
  onSelectionChange,
  onSelectAll,
  onEdit, 
  onChangeStatus 
}: CrewStatusTableProps) {
  const allSelected = crew.length > 0 && selectedCrewIds.length === crew.length;
  const someSelected = selectedCrewIds.length > 0 && selectedCrewIds.length < crew.length;

  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">
              <Checkbox
                checked={allSelected}
                onCheckedChange={onSelectAll}
                aria-label="전체 선택"
                className={someSelected ? "data-[state=checked]:bg-blue-600" : ""}
              />
            </TableHead>
            <TableHead>선주사</TableHead>
            <TableHead>플릿</TableHead>
            <TableHead>선박</TableHead>
            <TableHead>직급</TableHead>
            <TableHead>이름</TableHead>
            <TableHead>생년월일 (나이)</TableHead>
            <TableHead>국적</TableHead>
            <TableHead>매닝사</TableHead>
            <TableHead>상태</TableHead>
            <TableHead>구분</TableHead>
            <TableHead className="text-right">작업</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {crew.length === 0 ? (
            <TableRow>
              <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                등록된 선원이 없습니다
              </TableCell>
            </TableRow>
          ) : (
            crew.map((member) => (
              <TableRow key={member.id}>
                <TableCell>
                  <Checkbox
                    checked={selectedCrewIds.includes(member.id)}
                    onCheckedChange={(checked) => onSelectionChange(member.id, checked as boolean)}
                    aria-label={`${member.name} 선택`}
                  />
                </TableCell>
                <TableCell>{member.owner_name || '-'}</TableCell>
                <TableCell>{member.fleet_name || '-'}</TableCell>
                <TableCell>{member.ship_name || '-'}</TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{member.rank_name}</span>
                    <span className="text-xs text-muted-foreground">{member.rank_code}</span>
                  </div>
                </TableCell>
                <TableCell className="font-medium">{member.name}</TableCell>
                <TableCell>
                  {member.date_of_birth ? (
                    <div className="flex flex-col">
                      <span>{member.date_of_birth}</span>
                      {member.age && (
                        <span className="text-xs text-muted-foreground">({member.age}세)</span>
                      )}
                    </div>
                  ) : '-'}
                </TableCell>
                <TableCell>{member.nationality || '-'}</TableCell>
                <TableCell>{member.manning_agency_name || '-'}</TableCell>
                <TableCell>
                  <CrewStatusBadge status={member.current_status} />
                </TableCell>
                <TableCell>
                  <Badge variant={member.rank_category === 'officer' ? 'default' : 'secondary'}>
                    {member.rank_category === 'officer' ? '사관' : '부원'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit(member)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onChangeStatus(member)}
                    >
                      <RefreshCw className="w-4 h-4" />
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