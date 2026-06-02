import { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CheckCircle2, XCircle, Search, User, Ship, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { approvalService } from '@/services/approval.service';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { CrewRecommendationApprovalWithDetails } from '@/types/approval';

export default function ApprovalArchivePage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [approvals, setApprovals] = useState<CrewRecommendationApprovalWithDetails[]>([]);
  const [filtered, setFiltered] = useState<CrewRecommendationApprovalWithDetails[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'approved' | 'rejected'>('all');
  const [selected, setSelected] = useState<CrewRecommendationApprovalWithDetails | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  useEffect(() => { loadArchive(); }, []);

  useEffect(() => {
    let result = approvals;
    if (statusFilter !== 'all') result = result.filter(a => a.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(a =>
        a.requester_name?.toLowerCase().includes(q) ||
        a.approval_line?.name?.toLowerCase().includes(q)
      );
    }
    setFiltered(result);
    setCurrentPage(1);
  }, [approvals, search, statusFilter]);

  const loadArchive = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('crew_recommendation_approvals')
        .select('*')
        .in('status', ['approved', 'rejected'])
        .order('completed_at', { ascending: false });

      if (error) throw error;
      if (!data || data.length === 0) { setApprovals([]); return; }

      const details = await approvalService.getApprovalDetails(data.map(a => a.id));
      setApprovals(details);
    } catch (e) {
      console.error(e);
      toast({ title: '오류', description: '문서를 불러오는 데 실패했습니다.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="mb-5">
          <h1 className="text-2xl font-bold">결재 완료 문서함</h1>
          <p className="text-gray-500 text-sm mt-1">승인 또는 반려 처리된 과거 결재 문서를 조회합니다</p>
        </div>

        {/* 검색/필터 */}
        <div className="flex gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="요청자명, 결재선 이름으로 검색..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={v => setStatusFilter(v as 'all' | 'approved' | 'rejected')}>
            <SelectTrigger className="w-32 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              <SelectItem value="approved">승인</SelectItem>
              <SelectItem value="rejected">반려</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <p className="text-xs text-gray-500 mb-3">총 {filtered.length}건</p>

        {loading ? (
          <div className="text-center py-20 text-gray-400">로딩 중...</div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center text-gray-400">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>완료된 결재 문서가 없습니다</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="space-y-2">
              {paginated.map(approval => (
                <Card
                  key={approval.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setSelected(approval)}
                >
                  <CardHeader className="py-3 px-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {approval.status === 'approved'
                          ? <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                          : <XCircle className="w-5 h-5 text-red-500 shrink-0" />}
                        <div className="min-w-0">
                          <CardTitle className="text-sm font-medium truncate">
                            {approval.approval_line?.name || '결재 문서'}
                          </CardTitle>
                          <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              {approval.requester_name || '-'}
                            </span>
                            {approval.completed_at && (
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {format(new Date(approval.completed_at), 'yyyy.MM.dd HH:mm', { locale: ko })}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className={approval.status === 'approved'
                          ? 'bg-green-50 text-green-700 border-green-200 shrink-0'
                          : 'bg-red-50 text-red-700 border-red-200 shrink-0'}
                      >
                        {approval.status === 'approved' ? '승인' : '반려'}
                      </Badge>
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>

            {/* 페이지네이션 */}
            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-2 mt-5">
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm text-gray-600">{currentPage} / {totalPages}</span>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </>
        )}

        {/* 상세 다이얼로그 */}
        <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>결재 문서 상세</DialogTitle>
            </DialogHeader>
            {selected && (
              <div className="space-y-4 text-sm">
                <div className="flex items-center gap-2">
                  {selected.status === 'approved'
                    ? <Badge className="bg-green-600">승인 완료</Badge>
                    : <Badge variant="destructive">반려</Badge>}
                  <span className="font-medium">{selected.approval_line?.name}</span>
                </div>

                <div className="grid grid-cols-2 gap-3 bg-gray-50 p-3 rounded">
                  <div><span className="text-gray-500">요청자</span><p className="font-medium">{selected.requester_name}</p></div>
                  <div><span className="text-gray-500">요청일</span><p className="font-medium">{format(new Date(selected.created_at), 'yyyy.MM.dd HH:mm', { locale: ko })}</p></div>
                  {selected.completed_at && (
                    <div><span className="text-gray-500">완료일</span><p className="font-medium">{format(new Date(selected.completed_at), 'yyyy.MM.dd HH:mm', { locale: ko })}</p></div>
                  )}
                </div>

                {selected.requester_comment && (
                  <div className="bg-blue-50 p-3 rounded">
                    <p className="text-gray-500 mb-1">요청 사유</p>
                    <p>{selected.requester_comment}</p>
                  </div>
                )}

                <div>
                  <p className="font-semibold mb-2">결재 진행 이력</p>
                  <div className="space-y-2">
                    {selected.approval_line?.steps?.map(step => {
                      const action = selected.actions?.find(a => a.step_order === step.step_order);
                      return (
                        <div key={step.step_order} className={`flex items-start gap-3 p-2 rounded border ${
                          action?.action === 'approved' ? 'bg-green-50 border-green-200'
                          : action?.action === 'rejected' ? 'bg-red-50 border-red-200'
                          : 'bg-gray-50 border-gray-200'
                        }`}>
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                            action?.action === 'approved' ? 'bg-green-500 text-white'
                            : action?.action === 'rejected' ? 'bg-red-500 text-white'
                            : 'bg-gray-300 text-gray-600'
                          }`}>
                            {step.step_order}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{step.approver_name}</span>
                              <span className="text-gray-500 text-xs">{step.approver_role}</span>
                              {action && (
                                <span className={`text-xs font-medium ${action.action === 'approved' ? 'text-green-600' : 'text-red-600'}`}>
                                  {action.action === 'approved' ? '✓ 승인' : '✗ 반려'}
                                </span>
                              )}
                            </div>
                            {action?.comment && <p className="text-gray-600 text-xs mt-1">{action.comment}</p>}
                            {action?.created_at && (
                              <p className="text-gray-400 text-xs mt-0.5">
                                {format(new Date(action.created_at), 'yyyy.MM.dd HH:mm', { locale: ko })}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
