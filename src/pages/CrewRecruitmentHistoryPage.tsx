import { Fragment, useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Trash2, ChevronDown, ChevronRight, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { approvalService } from '@/services/approval.service';
import { getCurrentUser } from '@/lib/store';
import { supabase } from '@/lib/supabase';
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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  // crew_recommendation_id → 직급코드. 삭제된 건 결재이력만 지워지고 crew_recommendations
  // 원본은 남아있으므로, 현재 등록된 직급을 그때그때 조회해서 보여준다(추천 자체가 지워졌으면 '-').
  const [rankByRecommendationId, setRankByRecommendationId] = useState<Map<string, string>>(new Map());

  useEffect(() => { init(); }, []);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(logs.length / itemsPerPage));
    if (currentPage > maxPage) setCurrentPage(maxPage);
  }, [logs, itemsPerPage, currentPage]);

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
      const data = await approvalService.getApprovalDeletionLogs();
      setLogs(data);

      const recIds = [...new Set(data.map(l => l.crew_recommendation_id).filter((id): id is string => !!id))];
      if (recIds.length > 0) {
        const { data: recs } = await supabase.from('crew_recommendations').select('id, rank_id').in('id', recIds);
        const rankIds = [...new Set((recs || []).map(r => r.rank_id).filter(Boolean))];
        const { data: ranks } = rankIds.length > 0
          ? await supabase.from('ranks').select('id, rank_code').in('id', rankIds)
          : { data: [] };
        const rankCodeById = new Map((ranks || []).map(r => [r.id, r.rank_code]));
        setRankByRecommendationId(new Map((recs || []).map(r => [r.id, rankCodeById.get(r.rank_id) || '-'])));
      } else {
        setRankByRecommendationId(new Map());
      }
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

  const toggleSelect = (id: string) =>
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleSelectAll = (checked: boolean) =>
    setSelectedIds(checked ? logs.map(l => l.id) : []);

  const handleBulkDelete = async () => {
    if (!confirm(`선택한 ${selectedIds.length}건의 채용 히스토리를 완전히 삭제하시겠습니까? 되돌릴 수 없습니다.`)) return;
    try {
      setBulkDeleting(true);
      const results = await Promise.allSettled(selectedIds.map(id => approvalService.deleteApprovalDeletionLog(id)));
      const failed = results.filter(r => r.status === 'rejected').length;
      toast(failed > 0
        ? { title: '일부 삭제 실패', description: `${results.length - failed}건 삭제됨, ${failed}건 실패`, variant: 'destructive' }
        : { title: `${results.length}건 삭제되었습니다.` });
      setSelectedIds([]);
      await loadLogs();
    } finally {
      setBulkDeleting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(logs.length / itemsPerPage));
  const paginatedLogs = useMemo(
    () => logs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage),
    [logs, currentPage, itemsPerPage]
  );
  const goToPage = (p: number) => setCurrentPage(Math.max(1, Math.min(p, totalPages)));

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>;
  }

  return (
    <div className="px-1 py-1 space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">채용 히스토리 관리</CardTitle>
              <CardDescription className="text-xs mt-1">
                결재함에서 삭제된 선원추천 결재 건의 추천자/결재선/결재자별 승인·반려 이력을 영구 보관합니다.
                등록된 선원 정보와는 별개이며, 이 목록 자체는 시스템관리자 이상만 삭제할 수 있습니다.
              </CardDescription>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-xs text-gray-400">페이지당</span>
              <Select value={itemsPerPage.toString()} onValueChange={v => { setItemsPerPage(+v); setCurrentPage(1); }}>
                <SelectTrigger className="h-7 w-16 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{[10, 20, 50, 100].map(n => <SelectItem key={n} value={String(n)} className="text-sm">{n}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        {isAdmin && selectedIds.length > 0 && (
          <div className="flex items-center justify-between gap-2 bg-red-50 border-y border-red-200 px-4 py-2">
            <span className="text-xs text-red-800">{selectedIds.length}건 선택됨</span>
            <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 border-red-300 bg-white hover:bg-red-100" onClick={handleBulkDelete} disabled={bulkDeleting}>
              <Trash2 className="h-3.5 w-3.5 mr-1" />{bulkDeleting ? '삭제 중...' : `선택 영구 삭제 (${selectedIds.length})`}
            </Button>
          </div>
        )}
        <CardContent className="pt-0">
          {logs.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-400">보관된 채용 히스토리가 없습니다.</div>
          ) : (
            <>
            <Table>
              <TableHeader>
                <TableRow>
                  {isAdmin && (
                    <TableHead className="w-8">
                      <Checkbox
                        checked={logs.length > 0 && logs.every(l => selectedIds.includes(l.id))}
                        onCheckedChange={checked => toggleSelectAll(!!checked)}
                      />
                    </TableHead>
                  )}
                  <TableHead className="text-xs w-6" />
                  <TableHead className="text-xs">선원명</TableHead>
                  <TableHead className="text-xs">직급</TableHead>
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
                {paginatedLogs.map(log => {
                  const status = STATUS_LABEL[log.final_status] || { label: log.final_status, className: 'bg-gray-50 text-gray-700 border-gray-200' };
                  const expanded = expandedId === log.id;
                  return (
                    <Fragment key={log.id}>
                      <TableRow className="cursor-pointer hover:bg-gray-50" onClick={() => setExpandedId(expanded ? null : log.id)}>
                        {isAdmin && (
                          <TableCell onClick={e => e.stopPropagation()}>
                            <Checkbox checked={selectedIds.includes(log.id)} onCheckedChange={() => toggleSelect(log.id)} />
                          </TableCell>
                        )}
                        <TableCell>{expanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}</TableCell>
                        <TableCell className="font-medium text-sm">{log.crew_name}</TableCell>
                        <TableCell className="text-sm">{(log.crew_recommendation_id && rankByRecommendationId.get(log.crew_recommendation_id)) || '-'}</TableCell>
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
                          <TableCell colSpan={isAdmin ? 11 : 9} className="text-xs">
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
            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-2 py-3">
                <Button variant="outline" size="sm" onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1} className="h-8">
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const p = totalPages <= 5 ? i + 1
                    : currentPage <= 3 ? i + 1
                    : currentPage >= totalPages - 2 ? totalPages - 4 + i
                    : currentPage - 2 + i;
                  return (
                    <Button key={p} variant={currentPage === p ? 'default' : 'outline'} size="sm"
                      onClick={() => goToPage(p)} className="h-8 w-8 p-0">{p}</Button>
                  );
                })}
                <Button variant="outline" size="sm" onClick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages} className="h-8">
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
