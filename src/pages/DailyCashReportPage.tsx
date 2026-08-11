import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FileText, ChevronLeft, ChevronRight, RefreshCw, Send, ExternalLink, List, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { getCurrentUser } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { useTabContext } from '@/contexts/TabContext';
import {
  getOrCreateDraftReport, regenerateDraftReport, prepareDailyReportDraft, forceCancelConfirmedReport,
} from '@/services/accounting-daily-report.service';
import { DailyCashReportTable } from '@/components/accounting/daily-cash-report-table';
import type { DailyCashReport, AccountingDailyReportStatus } from '@/types/accounting';
import type { User } from '@/types/models';

const STATUS_BADGE: Record<AccountingDailyReportStatus, { label: string; className: string }> = {
  draft: { label: '작성중', className: 'bg-gray-100 text-gray-600' },
  pending_approval: { label: '결재중', className: 'bg-yellow-100 text-yellow-700' },
  confirmed: { label: '확정', className: 'bg-green-100 text-green-700' },
};

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
function shiftDate(date: string, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function DailyCashReportPage() {
  const navigate = useNavigate();
  const params = useParams<{ date?: string }>();
  const { toast } = useToast();
  const { openNewTab } = useTabContext();
  const permissions = usePermissions('accounting_daily_report');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [date, setDate] = useState(params.date || todayIso());
  const [report, setReport] = useState<DailyCashReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [forceCancelOpen, setForceCancelOpen] = useState(false);
  const [forceCancelReason, setForceCancelReason] = useState('');
  const [forceCancelSubmitting, setForceCancelSubmitting] = useState(false);

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'system_admin';

  useEffect(() => {
    if (!permissions.loading && !permissions.canView) navigate('/dashboard');
  }, [permissions.loading, permissions.canView, navigate]);

  // 날짜 이동(화살표/직접 입력) 시 주소도 함께 바꿔, 이 탭을 새로고침하거나 다시 열어도
  // 같은 날짜가 유지되게 한다.
  const changeDate = (next: string) => {
    setDate(next);
    navigate(`/accounting/daily-report/${next}`, { replace: true });
  };

  const loadReport = useCallback(async (targetDate: string, userId: string) => {
    setLoading(true);
    try {
      let r = await getOrCreateDraftReport(targetDate, userId);
      if (r.status === 'draft') r = await regenerateDraftReport(targetDate, userId);
      setReport(r);
    } catch (e) {
      console.error(e);
      toast({ title: '자금일보를 불러오는 중 오류가 발생했습니다.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    (async () => {
      const user = await getCurrentUser();
      setCurrentUser(user);
      if (user) await loadReport(date, user.id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (currentUser) loadReport(date, currentUser.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const handleRegenerate = async () => {
    if (!currentUser || !report || report.status !== 'draft') return;
    setWorking(true);
    try {
      setReport(await regenerateDraftReport(date, currentUser.id));
      toast({ title: '다시 계산되었습니다.' });
    } catch (e) {
      toast({ title: '재계산 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setWorking(false);
    }
  };

  const handleSubmit = async () => {
    if (!currentUser || !report || report.status !== 'draft') return;
    if (!confirm(`${date} 자금일보 기안문을 작성하시겠습니까? 기안문 작성 화면에서 결재선을 확인하고 최종 상신할 수 있습니다.`)) return;
    setWorking(true);
    try {
      const { draftId } = await prepareDailyReportDraft(date, currentUser.id);
      openNewTab(`/documents/new?draft=${draftId}`, `${date} 자금일보 기안`);
    } catch (e) {
      toast({ title: '기안문 작성 준비 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setWorking(false);
    }
  };

  const handleForceCancel = async () => {
    if (!currentUser || !report || report.status !== 'confirmed') return;
    if (!forceCancelReason.trim()) { toast({ title: '사유를 입력하세요.', variant: 'destructive' }); return; }
    setForceCancelSubmitting(true);
    try {
      await forceCancelConfirmedReport({ reportId: report.id, reason: forceCancelReason.trim(), performedBy: currentUser.id });
      toast({ title: '확정이 취소되었습니다.', description: '작성중 상태로 되돌아갔습니다. 필요하면 수정 후 다시 상신하세요.' });
      setForceCancelOpen(false);
      await loadReport(date, currentUser.id);
    } catch (e) {
      toast({ title: '확정 취소 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setForceCancelSubmitting(false);
    }
  };

  if (loading && !report) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>;
  }

  const sections = report?.snapshot || [];
  const isDraft = report?.status === 'draft';

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <FileText className="w-6 h-6" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">자금일보</h1>
            <p className="text-sm text-gray-500">통장·현금 계좌별로 전일이월-거래내역-금일잔액을 정리해 결재로 상신합니다.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => openNewTab('/accounting/daily-report', '자금일보')}>
          <List className="w-3.5 h-3.5" />목록
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => changeDate(shiftDate(date, -1))}><ChevronLeft className="w-4 h-4" /></Button>
              <Input type="date" value={date} onChange={e => changeDate(e.target.value)} className="h-8 w-[150px] text-sm" />
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => changeDate(shiftDate(date, 1))}><ChevronRight className="w-4 h-4" /></Button>
              {report && <Badge className={`text-xs ${STATUS_BADGE[report.status].className}`}>{STATUS_BADGE[report.status].label}</Badge>}
            </div>
            <div className="flex items-center gap-2">
              {isDraft && (
                <>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={handleRegenerate} disabled={working || loading}>
                    <RefreshCw className="w-3.5 h-3.5" />새로고침
                  </Button>
                  {permissions.canCreate && (
                    <Button size="sm" className="h-8 gap-1.5" onClick={handleSubmit} disabled={working || loading}>
                      <Send className="w-3.5 h-3.5" />결재 상신
                    </Button>
                  )}
                </>
              )}
              {!isDraft && report?.approval_document_id && (
                <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => openNewTab(`/documents/${report.approval_document_id}`, `${date} 자금일보`)}>
                  <ExternalLink className="w-3.5 h-3.5" />결재문서 보기
                </Button>
              )}
              {report?.status === 'confirmed' && isAdmin && (
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-red-600 border-red-200 hover:bg-red-50" onClick={() => { setForceCancelReason(''); setForceCancelOpen(true); }}>
                  <Ban className="w-3.5 h-3.5" />확정 취소
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <DailyCashReportTable sections={sections} />
        </CardContent>
      </Card>

      <Dialog open={forceCancelOpen} onOpenChange={open => !open && !forceCancelSubmitting && setForceCancelOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{date} 자금일보 확정 취소</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
              결재 절차 없이 관리자 권한으로 즉시 취소되어 작성중 상태로 돌아갑니다. 확정 당시 결재문서는 기록으로 그대로 남고, 다시 상신하면 새 결재문서가 만들어집니다.
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs">사유 *</Label>
              <Textarea value={forceCancelReason} onChange={e => setForceCancelReason(e.target.value)} rows={2} className="text-sm resize-none" disabled={forceCancelSubmitting} placeholder="확정 취소 사유를 입력하세요" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setForceCancelOpen(false)} disabled={forceCancelSubmitting}>닫기</Button>
            <Button variant="destructive" onClick={handleForceCancel} disabled={forceCancelSubmitting}>{forceCancelSubmitting ? '처리 중...' : '확정 취소'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
