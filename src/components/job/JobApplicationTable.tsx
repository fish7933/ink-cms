import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Eye } from 'lucide-react';
import type { JobApplication, CrewMember, Rank } from '@/types/models';

interface JobApplicationTableProps {
  applications: JobApplication[];
  crewMembers: CrewMember[];
  ranks: Rank[];
  onViewDetails: (application: JobApplication) => void;
  onUpdateStatus: (id: string, status: JobApplication['status']) => void;
  canUpdateStatus?: boolean;
}

export default function JobApplicationTable({ 
  applications, 
  crewMembers,
  ranks,
  onViewDetails,
  onUpdateStatus,
  canUpdateStatus = true
}: JobApplicationTableProps) {
  const getCrewName = (crewId: string | null) => {
    if (!crewId) return 'Unknown';
    return crewMembers.find(c => c.id === crewId)?.full_name || 'Unknown';
  };

  const getRankName = (rankId: string) => {
    return ranks.find(r => r.id === rankId)?.name || 'Unknown';
  };

  const getStatusBadge = (status: JobApplication['status']) => {
    const statusMap = {
      'received': { label: '접수', variant: 'secondary' as const },
      'under_review': { label: '검토중', variant: 'default' as const },
      'shortlisted': { label: '후보선정', variant: 'default' as const },
      'rejected': { label: '거절', variant: 'destructive' as const },
      'accepted': { label: '승인', variant: 'default' as const },
    };
    
    const config = statusMap[status] || { label: status, variant: 'secondary' as const };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  if (applications.length === 0) {
    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>지원자</TableHead>
              <TableHead>지원 직급</TableHead>
              <TableHead>지원일</TableHead>
              <TableHead>상태</TableHead>
              <TableHead className="text-right">작업</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                지원자가 없습니다
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
            <TableHead>지원자</TableHead>
            <TableHead>지원 직급</TableHead>
            <TableHead>지원일</TableHead>
            <TableHead>상태</TableHead>
            <TableHead className="text-right">작업</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {applications.map((app) => (
            <TableRow key={app.id}>
              <TableCell className="font-medium">{getCrewName(app.crew_member_id)}</TableCell>
              <TableCell>
                <Badge variant="outline">{getRankName(app.rank_id)}</Badge>
              </TableCell>
              <TableCell>{new Date(app.applied_at).toLocaleDateString('ko-KR')}</TableCell>
              <TableCell>{getStatusBadge(app.status)}</TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onViewDetails(app)}
                    className="gap-2"
                  >
                    <Eye className="w-4 h-4" />
                    상세
                  </Button>
                  {canUpdateStatus && (
                    <select
                      value={app.status}
                      onChange={(e) => onUpdateStatus(app.id, e.target.value as JobApplication['status'])}
                      className="h-8 px-2 rounded-md border border-input bg-background text-sm"
                    >
                      <option value="received">접수</option>
                      <option value="under_review">검토중</option>
                      <option value="shortlisted">후보선정</option>
                      <option value="rejected">거절</option>
                      <option value="accepted">승인</option>
                    </select>
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