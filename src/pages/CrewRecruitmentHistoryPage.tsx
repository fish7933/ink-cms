import { Fragment, useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { approvalService } from '@/services/approval.service';
import { getCurrentUser } from '@/lib/store';
import type { CrewRecommendationApprovalLog } from '@/types/approval';

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  approved: { label: '승인', className: 'bg-green-50 text-green-700 border-green-200' },
  rejected: { label: '반려', className: 'bg-red-50 text-red-700 border-red-200' },
  cancelled: { label: '취소', className: 'bg-gray-50 text-gray-700 border-gray-200' },
  pending: { label: '대기', className: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
};

export default function CrewRecruitmentHistoryPage() {
  const { toast } = useToast();
  const [logs, setLogs] = useState<CrewRecommendationApprovalLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => { init(); }, []);

  const init = async () => {
    try {
      setLoading(true);
      const currentUser = await getCurrentUser();
      setIsAdmin(currentUser?.role === 'admin' || currentUser?.role === 'system_admin');
      await loadLogs();
    } finally {
      setLoading(false);
    }
  };

  const loadLogs = async () => {
    try {
      setLogs(await approvalService.getApprovalDeletionLogs());
    } catch (e) {
      console.error(e);
      toast({ title: '오류', description: '채용 히스토리를 불러오는 중 오류가 발생했습니다.', variant: 'destructive' });
    }
  };

  const handleDelete = async (log: CrewRecommendationApprovalLog) => {
    if (!confirm(`${log.crew_name}님의 채용 히스토리를 완전히 삭제하시겠습니까? 되돌릴 수 없습니다.`)) return;
    try {
      await approvalService.deleteApprovalDeletionLog(log.id);
      toast({ title: '삭제되었습니다.' });
      await loadLogs();
    } catch (e) {
      toast({ title: '삭제 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>;
  }

  return (
    <div className="px-1 py-1 space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">채용 히스토리 관리</CardTitle>
          <CardDescription className="text-xs mt-1">
            결재함에서 삭제된 선원추천 결재 건의 추천자/결재선/결재자별 승인·반려 이력을 영구 보관합니다.
            등록된 선원 정보와는 별개이며, 이 목록 자체는 시스템관리자 이상만 삭제할 수 있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {logs.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-400">보관된 채용 히스토리가 없습니다.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs w-6" />
                  <TableHead className="text-xs">선원명</TableHead>
                  <TableHead className="text-xs">추천자</TableHead>
                  <TableHead className="text-xs">결재선</TableHead>
                  <TableHead className="text-xs">최종 상태</TableHead>
                  <TableHead className="text-xs">완료일</TableHead>
                  <TableHead className="text-xs">삭제한 사람</TableHead>
                  <TableHead className="text-xs">삭제일</TableHead>
                  {isAdmin && <TableHead className="text-right text-xs w-16">작업</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map(log => {
                  const status = STATUS_LABEL[log.final_status] || { label: log.final_status, className: 'bg-gray-50 text-gray-700 border-gray-200' };
                  const expanded = expandedId === log.id;
                  return (
                    <Fragment key={log.id}>
                      <TableRow className="cursor-pointer hover:bg-gray-50" onClick={() => setExpandedId(expanded ? null : log.id)}>
                        <TableCell>{expanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}</TableCell>
                        <TableCell className="font-medium text-sm">{log.crew_name}</TableCell>
                        <TableCell className="text-sm">{log.requester_name}</TableCell>
                        <TableCell className="text-sm">{log.approval_line_name || '-'}</TableCell>
                        <TableCell><Badge variant="outline" className={`text-xs ${status.className}`}>{status.label}</Badge></TableCell>
                        <TableCell className="text-sm">{log.completed_at ? format(new Date(log.completed_at), 'yyyy-MM-dd HH:mm', { locale: ko }) : '-'}</TableCell>
                        <TableCell className="text-sm">{log.deleted_by_name}</TableCell>
                        <TableCell className="text-sm">{format(new Date(log.deleted_at), 'yyyy-MM-dd HH:mm', { locale: ko })}</TableCell>
                        {isAdmin && (
                          <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-600" onClick={() => handleDelete(log)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                      {expanded && (
                        <TableRow className="bg-gray-50/60">
                          <TableCell colSpan={isAdmin ? 9 : 8} className="text-xs">
                            {log.actions.length === 0 ? (
                              <div className="text-gray-400 py-2">결재 진행 이력이 없습니다.</div>
                            ) : (
                              <div className="py-2 space-y-1.5">
                                {log.actions.sort((a, b) => a.step_order - b.step_order).map((a, i) => (
                                  <div key={i} className="flex items-center gap-2">
                                    <span className="text-gray-400 w-10">{a.step_order}단계</span>
                                    <span className="font-medium">{a.approver_name || '알 수 없음'}</span>
                                    <Badge variant="outline" className={a.action === 'approved' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}>
                                      {a.action === 'approved' ? '승인' : '반려'}
                                    </Badge>
                                    {a.comment && <span className="text-gray-500">"{a.comment}"</span>}
                                    <span className="text-gray-400 ml-auto">{format(new Date(a.created_at), 'yyyy-MM-dd HH:mm', { locale: ko })}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
