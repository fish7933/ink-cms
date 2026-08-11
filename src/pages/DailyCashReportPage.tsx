import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, ChevronLeft, ChevronRight, RefreshCw, Send, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getCurrentUser } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { useTabContext } from '@/contexts/TabContext';
import {
  getOrCreateDraftReport, regenerateDraftReport, submitDailyReportForApproval,
} from '@/services/accounting-daily-report.service';
import type { DailyCashReport, DailyCashReportSnapshotRow, AccountingDailyReportStatus } from '@/types/accounting';
import type { User } from '@/types/models';

const KIND_LABEL: Record<DailyCashReportSnapshotRow['kind'], string> = { bank_account: '통장', card: '카드', cash_register: '현금' };
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
  const { toast } = useToast();
  const { openNewTab } = useTabContext();
  const permissions = usePermissions('accounting_daily_report');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [date, setDate] = useState(todayIso());
  const [report, setReport] = useState<DailyCashReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!permissions.loading && !permissions.canView) navigate('/dashboard');
  }, [permissions.loading, permissions.canView, navigate]);

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
    if (!confirm(`${date} 자금일보를 결재 상신하시겠습니까?`)) return;
    setWorking(true);
    try {
      await submitDailyReportForApproval(date, currentUser.id);
      toast({ title: '자금일보가 상신되었습니다.' });
      await loadReport(date, currentUser.id);
    } catch (e) {
      toast({ title: '상신 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setWorking(false);
    }
  };

  if (loading && !report) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>;
  }

  const rows = report?.snapshot || [];
  const cashRows = rows.filter(r => r.kind !== 'card');
  const cardRows = rows.filter(r => r.kind === 'card');
  const totalOf = (list: DailyCashReportSnapshotRow[], key: keyof Pick<DailyCashReportSnapshotRow, 'opening_balance' | 'income' | 'expense' | 'closing_balance'>) =>
    list.reduce((s, r) => s + r[key], 0);
  const isDraft = report?.status === 'draft';

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-4">
      <div className="flex items-center gap-2">
        <FileText className="w-6 h-6" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">자금일보</h1>
          <p className="text-sm text-gray-500">통장·카드·현금의 전일잔액-입금-출금-금일잔액을 날짜별로 정리해 결재로 상신합니다.</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setDate(d => shiftDate(d, -1))}><ChevronLeft className="w-4 h-4" /></Button>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-8 w-[150px] text-sm" />
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setDate(d => shiftDate(d, 1))}><ChevronRight className="w-4 h-4" /></Button>
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
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-4">
          <div className="border rounded-md overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-2 text-xs font-medium text-gray-600">구분</th>
                  <th className="text-left p-2 text-xs font-medium text-gray-600">계좌명</th>
                  <th className="text-right p-2 text-xs font-medium text-gray-600">전일잔액</th>
                  <th className="text-right p-2 text-xs font-medium text-gray-600">입금</th>
                  <th className="text-right p-2 text-xs font-medium text-gray-600">출금</th>
                  <th className="text-right p-2 text-xs font-medium text-gray-600">금일잔액</th>
                </tr>
              </thead>
              <tbody>
                {cashRows.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8 text-gray-400 text-sm">등록된 통장/현금 시재가 없습니다.</td></tr>
                ) : cashRows.map(r => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="p-2 text-gray-500">{KIND_LABEL[r.kind]}</td>
                    <td className="p-2 font-medium">{r.name}</td>
                    <td className="p-2 text-right font-mono">{r.opening_balance.toLocaleString()}</td>
                    <td className="p-2 text-right font-mono text-blue-700">{r.income.toLocaleString()}</td>
                    <td className="p-2 text-right font-mono text-red-600">{r.expense.toLocaleString()}</td>
                    <td className="p-2 text-right font-mono font-semibold">{r.closing_balance.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              {cashRows.length > 0 && (
                <tfoot className="bg-gray-50 border-t">
                  <tr>
                    <td colSpan={2} className="p-2 font-semibold text-sm">현금성자산 합계</td>
                    <td className="p-2 text-right font-mono font-semibold">{totalOf(cashRows, 'opening_balance').toLocaleString()}</td>
                    <td className="p-2 text-right font-mono font-semibold text-blue-700">{totalOf(cashRows, 'income').toLocaleString()}</td>
                    <td className="p-2 text-right font-mono font-semibold text-red-600">{totalOf(cashRows, 'expense').toLocaleString()}</td>
                    <td className="p-2 text-right font-mono font-semibold">{totalOf(cashRows, 'closing_balance').toLocaleString()}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {cardRows.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-1.5">카드 사용 내역 (현금성자산 합계에는 포함되지 않음)</p>
              <div className="border rounded-md overflow-hidden overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left p-2 text-xs font-medium text-gray-600">카드명</th>
                      <th className="text-right p-2 text-xs font-medium text-gray-600">금일 사용액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cardRows.map(r => (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="p-2 font-medium">{r.name}</td>
                        <td className="p-2 text-right font-mono">{r.closing_balance.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t">
                    <tr>
                      <td className="p-2 font-semibold text-sm">카드 사용 합계</td>
                      <td className="p-2 text-right font-mono font-semibold">{totalOf(cardRows, 'closing_balance').toLocaleString()}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
