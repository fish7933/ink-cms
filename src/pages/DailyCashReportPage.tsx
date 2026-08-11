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
import type { DailyCashReport, DailyCashReportSnapshotSection, AccountingDailyReportStatus } from '@/types/accounting';
import type { User } from '@/types/models';

const KIND_LABEL: Record<DailyCashReportSnapshotSection['kind'], string> = { bank_account: '통장', cash_register: '현금' };
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

  const sections = report?.snapshot || [];
  // 통화가 다르면(원화/달러 등) 그냥 더하는 게 의미가 없으므로 통화별로 따로 합산한다.
  const totalsByCurrency = new Map<string, number>();
  for (const s of sections) totalsByCurrency.set(s.currency, (totalsByCurrency.get(s.currency) || 0) + s.closing_balance);
  const isDraft = report?.status === 'draft';

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-4">
      <div className="flex items-center gap-2">
        <FileText className="w-6 h-6" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">자금일보</h1>
          <p className="text-sm text-gray-500">통장·현금 계좌별로 전일이월-거래내역-금일잔액을 정리해 결재로 상신합니다.</p>
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
        <CardContent className="pt-0 space-y-5">
          <div className="border rounded-md overflow-hidden overflow-x-auto">
            <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '15%' }} />
                <col style={{ width: '55%' }} />
                <col style={{ width: '30%' }} />
              </colgroup>
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-2 text-xs font-medium text-gray-600">구분</th>
                  <th className="text-left p-2 text-xs font-medium text-gray-600">계좌명</th>
                  <th className="text-right p-2 text-xs font-medium text-gray-600">금일잔액</th>
                </tr>
              </thead>
              <tbody>
                {sections.length === 0 ? (
                  <tr><td colSpan={3} className="text-center py-8 text-gray-400 text-sm">등록된 통장/현금 시재가 없습니다.</td></tr>
                ) : sections.map(s => (
                  <tr key={s.id} className="border-b last:border-0">
                    <td className="p-2 text-gray-500 truncate">{KIND_LABEL[s.kind]}</td>
                    <td className="p-2 font-medium truncate">{s.name}</td>
                    <td className="p-2 text-right font-mono font-semibold truncate">{s.closing_balance.toLocaleString()} {s.currency}</td>
                  </tr>
                ))}
              </tbody>
              {sections.length > 0 && (
                <tfoot className="bg-gray-50 border-t">
                  {[...totalsByCurrency.entries()].map(([currency, total]) => (
                    <tr key={currency}>
                      <td colSpan={2} className="p-2 font-semibold text-sm">합계 ({currency})</td>
                      <td className="p-2 text-right font-mono font-semibold truncate">{total.toLocaleString()} {currency}</td>
                    </tr>
                  ))}
                </tfoot>
              )}
            </table>
          </div>

          {sections.map(s => (
            <div key={s.id}>
              <p className="text-xs font-semibold text-gray-600 mb-1.5">{KIND_LABEL[s.kind]} — {s.name} ({s.currency})</p>
              <div className="border rounded-md overflow-hidden overflow-x-auto">
                <table className="w-full text-xs" style={{ tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: '6%' }} />
                    <col style={{ width: '11%' }} />
                    <col style={{ width: '13%' }} />
                    <col style={{ width: '13%' }} />
                    <col style={{ width: '17%' }} />
                    <col style={{ width: '18%' }} />
                    <col style={{ width: '22%' }} />
                  </colgroup>
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-center p-2 font-medium text-gray-600">No.</th>
                      <th className="text-left p-2 font-medium text-gray-600">일자</th>
                      <th className="text-right p-2 font-medium text-gray-600">출금</th>
                      <th className="text-right p-2 font-medium text-gray-600">입금</th>
                      <th className="text-right p-2 font-medium text-gray-600">잔액</th>
                      <th className="text-left p-2 font-medium text-gray-600">상대거래처</th>
                      <th className="text-left p-2 font-medium text-gray-600">적요</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b bg-gray-50/50">
                      <td className="p-2 text-center text-gray-500">0</td>
                      <td className="p-2 text-gray-500">전일이월</td>
                      <td className="p-2"></td>
                      <td className="p-2"></td>
                      <td className="p-2 text-right font-mono truncate">{s.opening_balance.toLocaleString()} {s.currency}</td>
                      <td className="p-2"></td>
                      <td className="p-2"></td>
                    </tr>
                    {s.transactions.length === 0 ? (
                      <tr><td colSpan={7} className="text-center py-4 text-gray-400">이날 거래 내역이 없습니다.</td></tr>
                    ) : s.transactions.map((t, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="p-2 text-center text-gray-500">{i + 1}</td>
                        <td className="p-2 truncate">{t.date}</td>
                        <td className="p-2 text-right font-mono text-red-600 truncate">{t.expense ? t.expense.toLocaleString() : ''}</td>
                        <td className="p-2 text-right font-mono text-blue-700 truncate">{t.income ? t.income.toLocaleString() : ''}</td>
                        <td className="p-2 text-right font-mono truncate">{t.balance.toLocaleString()} {s.currency}</td>
                        <td className="p-2 truncate">{t.counterparty}</td>
                        <td className="p-2 text-gray-500 truncate">{t.description}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t">
                    <tr>
                      <td colSpan={2} className="p-2 font-semibold">합계</td>
                      <td className="p-2 text-right font-mono font-semibold text-red-600 truncate">{s.total_expense.toLocaleString()}</td>
                      <td className="p-2 text-right font-mono font-semibold text-blue-700 truncate">{s.total_income.toLocaleString()}</td>
                      <td className="p-2 text-right font-mono font-semibold truncate">{s.closing_balance.toLocaleString()} {s.currency}</td>
                      <td className="p-2"></td>
                      <td className="p-2"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
