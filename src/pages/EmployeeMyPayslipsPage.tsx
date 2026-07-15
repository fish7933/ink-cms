import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wallet, CheckCircle2, AlertTriangle, Clock, Printer, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { getCurrentUser } from '@/services/auth.service';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { EMPLOYEE_ROLES } from '@/pages/EmployeeCardManagementPage';
import { getMyPayslips, acknowledgePayslip } from '@/services/employee-salary.service';
import { groupPayslipItems, isDeductionGroup } from '@/lib/employee-payslip-groups';
import type { EmployeePayslipWithDetails } from '@/types/employee-salary';

const fmt = (n: number) => n.toLocaleString('ko-KR');

// 직원 본인의 급여명세서를 확인하고 승인/이의제기하는 화면 — "월별 지급 처리"에서 담당자가
// "직원 확인 요청"을 누른 명세서부터 여기 나타난다.
export default function EmployeeMyPayslipsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const permissions = usePermissions('my_payslips');

  const [checking, setChecking] = useState(true);
  const [currentUserId, setCurrentUserId] = useState('');
  const [payslips, setPayslips] = useState<EmployeePayslipWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewingPayslip, setViewingPayslip] = useState<EmployeePayslipWithDetails | null>(null);
  const [disputing, setDisputing] = useState<EmployeePayslipWithDetails | null>(null);
  const [disputeComment, setDisputeComment] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  const [filterYear, setFilterYear] = useState('all');
  const [filterMonth, setFilterMonth] = useState('all');
  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  useEffect(() => {
    const init = async () => {
      const user = await getCurrentUser();
      if (!user || !EMPLOYEE_ROLES.includes(user.role ?? '')) { navigate('/dashboard'); return; }
      setCurrentUserId(user.id);
      setChecking(false);
      setPayslips(await getMyPayslips(user.id));
      setLoading(false);
    };
    init();
  }, [navigate]);

  useEffect(() => {
    if (!permissions.loading && !permissions.canView) navigate('/dashboard');
  }, [permissions.loading, permissions.canView, navigate]);

  const reload = async () => setPayslips(await getMyPayslips(currentUserId));

  const handleApprove = async (payslip: EmployeePayslipWithDetails) => {
    if (!confirm(`${payslip.period_year_month} 급여명세서를 승인하시겠습니까?`)) return;
    try {
      setProcessingId(payslip.id);
      await acknowledgePayslip(payslip.id, 'approved');
      toast({ title: '승인되었습니다.' });
      window.dispatchEvent(new Event('my-payslips-data-changed'));
      await reload();
    } catch (e) {
      toast({ title: '처리 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setProcessingId(null);
    }
  };

  const openDispute = (payslip: EmployeePayslipWithDetails) => {
    setDisputing(payslip);
    setDisputeComment('');
  };

  const handleSubmitDispute = async () => {
    if (!disputing) return;
    if (!disputeComment.trim()) { toast({ title: '이의제기 사유를 입력해주세요.', variant: 'destructive' }); return; }
    try {
      setProcessingId(disputing.id);
      await acknowledgePayslip(disputing.id, 'disputed', disputeComment.trim());
      toast({ title: '이의제기가 접수되었습니다.', description: '담당자가 확인 후 조치합니다.' });
      setDisputing(null);
      window.dispatchEvent(new Event('my-payslips-data-changed'));
      await reload();
    } catch (e) {
      toast({ title: '처리 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setProcessingId(null);
    }
  };

  const years = useMemo(
    () => [...new Set(payslips.map(p => p.period_year_month?.slice(0, 4)).filter((y): y is string => !!y))].sort((a, b) => b.localeCompare(a)),
    [payslips]
  );
  const filteredPayslips = useMemo(
    () => payslips.filter(p => {
      if (!p.period_year_month) return false;
      const [y, m] = p.period_year_month.split('-');
      if (filterYear !== 'all' && y !== filterYear) return false;
      if (filterMonth !== 'all' && m !== filterMonth) return false;
      return true;
    }),
    [payslips, filterYear, filterMonth]
  );
  useEffect(() => { setPage(1); }, [filterYear, filterMonth]);
  const totalPages = Math.max(1, Math.ceil(filteredPayslips.length / itemsPerPage));
  const paginatedPayslips = filteredPayslips.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  if (checking || loading || permissions.loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>;
  }

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-blue-600" />
            <div>
              <CardTitle className="text-base">내 급여명세서</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">담당자가 확인 요청한 명세서를 검토하고 승인하거나 이의를 제기할 수 있습니다.</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          {payslips.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Select value={filterYear} onValueChange={setFilterYear}>
                  <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-sm">전체 연도</SelectItem>
                    {years.map(y => <SelectItem key={y} value={y} className="text-sm">{y}년</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterMonth} onValueChange={setFilterMonth}>
                  <SelectTrigger className="h-8 w-20 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-sm">전체 월</SelectItem>
                    {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map(m => (
                      <SelectItem key={m} value={m} className="text-sm">{Number(m)}월</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-400">페이지당</span>
                <Select value={itemsPerPage.toString()} onValueChange={v => { setItemsPerPage(+v); setPage(1); }}>
                  <SelectTrigger className="h-7 w-16 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{[10, 20, 50].map(n => <SelectItem key={n} value={String(n)} className="text-sm">{n}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          )}
          {filteredPayslips.length === 0 ? (
            <div className="text-center py-12 text-sm text-gray-400">
              {payslips.length === 0 ? '아직 확인할 급여명세서가 없습니다.' : '해당하는 급여명세서가 없습니다.'}
            </div>
          ) : (
            <div className="space-y-2">
              {paginatedPayslips.map(p => (
                <div key={p.id} className="rounded-md border p-3 hover:bg-gray-50 cursor-pointer" onClick={() => setViewingPayslip(p)}>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{p.period_year_month}</span>
                      {p.period_status === 'confirmed' && <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">지급확정</Badge>}
                      {p.period_status === 'pending_approval' && <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">결재 진행중</Badge>}
                      {p.ack_status === 'approved' && <Badge className="text-xs bg-green-600 gap-1"><CheckCircle2 className="w-3 h-3" />승인함</Badge>}
                      {p.ack_status === 'disputed' && <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-300 gap-1"><AlertTriangle className="w-3 h-3" />이의제기함</Badge>}
                      {p.ack_status === 'pending' && <Badge variant="outline" className="text-xs text-gray-500 gap-1"><Clock className="w-3 h-3" />확인 필요</Badge>}
                    </div>
                    <span className="font-mono font-bold">{fmt(p.net_amount)}원</span>
                  </div>
                  {p.ack_status === 'pending' && (
                    <div className="flex justify-end gap-2 mt-2" onClick={e => e.stopPropagation()}>
                      <Button size="sm" variant="outline" onClick={() => openDispute(p)} disabled={processingId === p.id}>이의제기</Button>
                      <Button size="sm" onClick={() => handleApprove(p)} disabled={processingId === p.id}>{processingId === p.id ? '처리 중...' : '승인'}</Button>
                    </div>
                  )}
                  {p.ack_status === 'disputed' && p.ack_comment && (
                    <p className="text-xs text-amber-700 mt-1.5">이의제기 사유: {p.ack_comment}</p>
                  )}
                </div>
              ))}
            </div>
          )}
          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="h-8">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const p = totalPages <= 5 ? i + 1
                  : page <= 3 ? i + 1
                  : page >= totalPages - 2 ? totalPages - 4 + i
                  : page - 2 + i;
                return (
                  <Button key={p} variant={page === p ? 'default' : 'outline'} size="sm"
                    onClick={() => setPage(p)} className="h-8 w-8 p-0">
                    {p}
                  </Button>
                );
              })}
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="h-8">
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!viewingPayslip} onOpenChange={o => !o && setViewingPayslip(null)}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">{viewingPayslip?.period_year_month} 급여명세서</DialogTitle>
          </DialogHeader>
          {viewingPayslip && (
            <div className="space-y-3 py-1">
              {groupPayslipItems(viewingPayslip.items).map(group => (
                <div key={group.key} className="space-y-1">
                  <Label className="text-xs">{group.label}</Label>
                  <div className="rounded-md border overflow-hidden">
                    {group.items.map(item => (
                      <div key={item.id} className="flex items-center justify-between px-3 py-1.5 text-sm border-b last:border-b-0">
                        <span>{item.name}</span>
                        <span className={`font-mono ${isDeductionGroup(group) ? 'text-red-600' : ''}`}>{isDeductionGroup(group) ? '-' : ''}{fmt(item.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <div className="rounded-md border bg-blue-50 border-blue-200 px-3 py-2 flex items-center justify-between text-sm">
                <span className="font-medium text-blue-900">실지급액</span>
                <span className="font-bold font-mono text-blue-900">{fmt(viewingPayslip.net_amount)}원</span>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => window.open(`/print/employee-payslips/${viewingPayslip.id}`, '_blank')}>
                  <Printer className="w-3.5 h-3.5" />인쇄
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!disputing} onOpenChange={o => !o && setDisputing(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">{disputing?.period_year_month} 급여명세서 이의제기</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5 py-1">
            <Label className="text-xs">사유 *</Label>
            <Textarea value={disputeComment} onChange={e => setDisputeComment(e.target.value)} rows={3} placeholder="문제가 있는 부분을 적어주세요. 담당자에게 전달됩니다." />
            <p className="text-xs text-gray-400">이의제기해도 담당자의 처리는 계속 진행되며, 담당자에게 사유가 표시됩니다.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDisputing(null)} disabled={!!processingId}>취소</Button>
            <Button size="sm" variant="destructive" onClick={handleSubmitDispute} disabled={!!processingId}>{processingId ? '처리 중...' : '이의제기 접수'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
