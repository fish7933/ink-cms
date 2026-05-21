import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Pencil, Trash2, Eye } from 'lucide-react';
import type { JobPosting, Ship, Rank } from '@/types/models';

interface JobPostingTableProps {
  jobPostings: JobPosting[];
  ships: Ship[];
  ranks: Rank[];
  onEdit: (job: JobPosting) => void;
  onDelete: (id: string) => void;
  onViewApplications: (jobId: string) => void;
  canEdit?: boolean;
  canDelete?: boolean;
}

export default function JobPostingTable({ 
  jobPostings, 
  ships, 
  ranks,
  onEdit, 
  onDelete,
  onViewApplications,
  canEdit = true,
  canDelete = true
}: JobPostingTableProps) {
  const getShipName = (shipId: string | null | undefined) => {
    if (!shipId) return 'Unknown';
    return ships.find(s => s.id === shipId)?.name || 'Unknown';
  };

  const getRankName = (rankId: string) => {
    return ranks.find(r => r.id === rankId)?.name || 'Unknown';
  };

  const showActions = canEdit || canDelete;

  if (jobPostings.length === 0) {
    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>선박</TableHead>
              <TableHead>구인 직급</TableHead>
              <TableHead>승선일</TableHead>
              <TableHead>계약기간</TableHead>
              <TableHead>급여범위</TableHead>
              <TableHead>상태</TableHead>
              <TableHead className="text-right">작업</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                등록된 구인 공고가 없습니다
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
            <TableHead>구인 직급</TableHead>
            <TableHead>승선일</TableHead>
            <TableHead>계약기간</TableHead>
            <TableHead>급여범위</TableHead>
            <TableHead>상태</TableHead>
            <TableHead className="text-right">작업</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobPostings.map((job) => (
            <TableRow key={job.id}>
              <TableCell className="font-medium">{getShipName(job.ship_id)}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {job.positions && job.positions.length > 0 ? (
                    job.positions.map((pos, idx) => (
                      <Badge key={idx} variant="secondary" className="text-xs">
                        {getRankName(pos.rank_id)} x{pos.positions_count}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </div>
              </TableCell>
              <TableCell>{job.embarkation_date}</TableCell>
              <TableCell>{job.contract_period}</TableCell>
              <TableCell>{job.salary_range}</TableCell>
              <TableCell>
                <Badge variant={job.status === 'open' ? 'default' : 'secondary'}>
                  {job.status === 'open' ? '모집중' : '마감'}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onViewApplications(job.id)}
                    className="gap-2"
                  >
                    <Eye className="w-4 h-4" />
                    지원자
                  </Button>
                  {canEdit && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onEdit(job)}
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
                      onClick={() => onDelete(job.id)}
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