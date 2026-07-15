import { useState, useEffect, useCallback } from 'react';
import { Printer, Unlock, RefreshCw, X, Plus, Trash2, FileSpreadsheet, FileText, UserCheck, Send, ExternalLink, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { getCurrentUser } from '@/services/auth.service';
import { getCompanyInfo } from '@/services/company-info.service';
import { exportPayrollLedgerToExcel } from '@/utils/employee-payroll-ledger-export';
import PayslipAcknowledgmentStatus from '@/components/employee-salary/PayslipAcknowledgmentStatus';
import EmployeePayslipDetailView from '@/components/employee-salary/EmployeePayslipDetailView';
import {
  getPayrollPeriods,
  getOrCreatePayrollPeriod,
  getPayslipsForPeriod,
  generatePayslipsForPeriod,
  updatePayslipItems,
  deletePayslip,
  requestEmployeeAcknowledgment,
  submitPayrollExpenseReport,
  reopenPayrollPeriod,
  getPayrollLedgerForPeriod,
  updatePayrollPeriodPaymentDate,
  cancelPayslipsForPeriod,
} from '@/services/employee-salary.service';
import type { EmployeePayrollPeriod, EmployeePayrollPeriodSummary, EmployeePayslipItem, EmployeePayslipWithDetails, EmployeeSalaryItemCategory } from '@/types/employee-salary';

const CATEGORY_LABELS: Record<EmployeeSalaryItemCategory, string> = { base: '기본급', allowance: '수당', deduction: '공제' };
const CATEGORIES: EmployeeSalaryItemCategory[] = ['base', 'allowance', 'deduction'];
const STATUS_LABELS: Record<string, string> = { draft: '작성중', pending_ack: '직원 확인중', pending_approval: '결재 진행중', confirmed: '확정됨' };
const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  pending_ack: 'bg-blue-50 text-blue-700 border-blue-200',
  pending_approval: 'bg-purple-50 text-purple-700 border-purple-200',
  confirmed: 'bg-green-50 text-green-700 border-green-200',
};
const fmt = (n: number) => n.toLocaleString('ko-KR');
const currentYearMonth = () => new Date().toISOString().slice(0, 7);

type DraftItem = { key: number; category: EmployeeSalaryItemCategory; name: string; amount: string };

// 월별 급여 지급 처리 — 급여 항목 관리 탭에서 입력한 "현재" 급여 항목을 스냅샷으로 생성한
// 뒤, 각 직원의 확인(승인/이의제기)을 거쳐 지출결의서로 결재 상신하고, 결재가 승인되면
// 자동으로 지급확정된다 (applyReferenceSideEffect에서 처리).
export default function EmployeePayrollPeriodsSection() {
  const { toast } = useToast();
  const permissions = usePermissions('employee_salary');

  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [periods, setPeriods] = useState<EmployeePayrollPeriodSummary[]>([]);
  const [currentPeriod, setCurrentPeriod] = useState<EmployeePayrollPeriod | null>(null);
  const [payslips, setPayslips] = useState<EmployeePayslipWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [requestingAck, setRequestingAck] = useState(false);
  const [submittingExpenseReport, setSubmittingExpenseReport] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [ackRefreshKey, setAckRefreshKey] = useState(0);
  const [paymentDateInput, setPaymentDateInput] = useState('');
  const [savingPaymentDate, setSavingPaymentDate] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);

  const [editingPayslip, setEditingPayslip] = useState<EmployeePayslipWithDetails | null>(null);
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [savingItems, setSavingItems] = useState(false);
  const [viewingPayslip, setViewingPayslip] = useState<EmployeePayslipWithDetails | null>(null);

  const loadPeriods = useCallback(() => { getPayrollPeriods().then(setPeriods); }, []);

  const loadPeriodAndPayslips = useCallback(async (ym: string) => {
    setLoading(true);
    try {
      const period = await getOrCreatePayrollPeriod(ym);
      setCurrentPeriod(period);
      setPaymentDateInput(period.payment_date || '');
      setPayslips(await getPayslipsForPeriod(period.id));
      setAckRefreshKey(k => k + 1);
    } catch (e) {
      toast({ title: '조회 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadPeriods(); }, [loadPeriods]);
  useEffect(() => { loadPeriodAndPayslips(yearMonth); }, [yearMonth, loadPeriodAndPayslips]);
  useEffect(() => { getCurrentUser().then(u => setCurrentUserRole(u?.role || null)); }, []);

  const refresh = async () => {
    if (!currentPeriod) return;
    setPayslips(await getPayslipsForPeriod(currentPeriod.id));
    setAckRefreshKey(k => k + 1);
    loadPeriods();
  };

  const handleGenerate = async () => {
    if (!currentPeriod) return;
    try {
      setGenerating(true);
      const result = await generatePayslipsForPeriod(currentPeriod.id);
      toast({ title: `${result.created}건 생성되었습니다.`, description: result.skipped > 0 ? `이미 존재하는 ${result.skipped}건은 건너뛰었습니다.` : undefined });
      await refresh();
    } catch (e) {
      toast({ title: '생성 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const handleCancelAll = async () => {
    if (!currentPeriod) return;
    if (!confirm(`${currentPeriod.year_month} 명세서 ${payslips.length}건을 모두 취소하시겠습니까? "명세서 생성"을 다시 누르면 현재 급여 항목 기준으로 새로 만들 수 있습니다.`)) return;
    try {
      setCancelling(true);
      await cancelPayslipsForPeriod(currentPeriod.id);
      toast({ title: '명세서가 취소되었습니다.' });
      await refresh();
    } catch (e) {
      toast({ title: '취소 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setCancelling(false);
    }
  };

  const handleRemovePayslip = async (payslip: EmployeePayslipWithDetails) => {
    if (!confirm(`"${payslip.employee_name}"의 이번 달 명세서를 제외하시겠습니까? 다시 "명세서 생성"을 누르면 재생성됩니다.`)) return;
    try {
      await deletePayslip(payslip.id);
      toast({ title: '제외되었습니다.' });
      await refresh();
    } catch (e) {
      toast({ title: '실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    }
  };

  const handleRequestAck = async () => {
    if (!currentPeriod) return;
    if (payslips.length === 0) { toast({ title: '먼저 명세서를 생성해주세요.', variant: 'destructive' }); return; }
    if (!confirm(`${currentPeriod.year_month} 명세서를 각 직원에게 확인 요청하시겠습니까? 이후 항목 편집은 잠깁니다.`)) return;
    try {
      setRequestingAck(true);
      await requestEmployeeAcknowledgment(currentPeriod.id);
      toast({ title: '직원 확인을 요청했습니다.' });
      window.dispatchEvent(new Event('my-payslips-data-changed'));
      await loadPeriodAndPayslips(yearMonth);
      loadPeriods();
    } catch (e) {
      toast({ title: '요청 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setRequestingAck(false);
    }
  };

  const handleSubmitExpenseReport = async () => {
    if (!currentPeriod) return;
    if (!confirm(`${currentPeriod.year_month} 급여대장을 지출결의서로 결재 상신하시겠습니까?`)) return;
    try {
      setSubmittingExpenseReport(true);
      const user = await getCurrentUser();
      if (!user) return;
      await submitPayrollExpenseReport(currentPeriod.id, user.id);
      toast({ title: '지출결의서를 상신했습니다.' });
      await loadPeriodAndPayslips(yearMonth);
      loadPeriods();
    } catch (e) {
      toast({ title: '상신 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setSubmittingExpenseReport(false);
    }
  };

  const handleReopen = async () => {
    if (!currentPeriod) return;
    if (!confirm('확정을 취소하고 다시 편집 가능한 상태로 되돌리시겠습니까?')) return;
    try {
      await reopenPayrollPeriod(currentPeriod.id);
      toast({ title: '재오픈되었습니다.' });
      window.dispatchEvent(new Event('my-payslips-data-changed'));
      await loadPeriodAndPayslips(yearMonth);
      loadPeriods();
    } catch (e) {
      toast({ title: '실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    }
  };

  const handleSavePaymentDate = async () => {
    if (!currentPeriod) return;
    try {
      setSavingPaymentDate(true);
      await updatePayrollPeriodPaymentDate(currentPeriod.id, paymentDateInput || null);
      setCurrentPeriod({ ...currentPeriod, payment_date: paymentDateInput || null });
      toast({ title: '지급일이 저장되었습니다.' });
    } catch (e) {
      toast({ title: '저장 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setSavingPaymentDate(false);
    }
  };

  const openEditDialog = (payslip: EmployeePayslipWithDetails) => {
    setEditingPayslip(payslip);
    setDraftItems(payslip.items.map((i, idx) => ({ key: idx, category: i.category, name: i.name, amount: String(i.amount) })));
  };

  const addDraftItem = (category: EmployeeSalaryItemCategory) => {
    setDraftItems(prev => [...prev, { key: Date.now() + Math.random(), category, name: '', amount: '' }]);
  };
  const updateDraftItem = (key: number, patch: Partial<DraftItem>) => {
    setDraftItems(prev => prev.map(i => (i.key === key ? { ...i, ...patch } : i)));
  };
  const removeDraftItem = (key: number) => setDraftItems(prev => prev.filter(i => i.key !== key));

  const handleSaveItems = async () => {
    if (!editingPayslip) return;
    if (draftItems.some(i => !i.name.trim())) { toast({ title: '항목명을 모두 입력해주세요.', variant: 'destructive' }); return; }
    try {
      setSavingItems(true);
      const items: Omit<EmployeePayslipItem, 'id' | 'payslip_id'>[] = CATEGORIES.flatMap(category =>
        draftItems.filter(i => i.category === category).map((i, idx) => ({ category, pay_group: null, name: i.name.trim(), amount: Number(i.amount) || 0, display_order: idx }))
      );
      await updatePayslipItems(editingPayslip.id, items);
      toast({ title: '저장되었습니다.' });
      setEditingPayslip(null);
      await refresh();
    } catch (e) {
      toast({ title: '저장 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setSavingItems(false);
    }
  };

  const handleExportExcel = async () => {
    if (!currentPeriod) return;
    try {
      setExportingExcel(true);
      const [ledger, company] = await Promise.all([getPayrollLedgerForPeriod(currentPeriod.id), getCompanyInfo().catch(() => null)]);
      if (!ledger || ledger.rows.length === 0) { toast({ title: '내려받을 명세서가 없습니다.', variant: 'destructive' }); return; }
      await exportPayrollLedgerToExcel(ledger, company?.name || '');
    } catch (e) {
      toast({ title: '엑셀 다운로드 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setExportingExcel(false);
    }
  };

  const isDraft = currentPeriod?.status === 'draft';
  const isPendingAck = currentPeriod?.status === 'pending_ack';
  const isPendingApproval = currentPeriod?.status === 'pending_approval';
  const allAcked = payslips.length > 0 && payslips.every(p => p.ack_status !== 'pending');
  const draftTotal = (category: EmployeeSalaryItemCategory) => draftItems.filter(i => i.category === category).reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
  const draftNet = draftTotal('base') + draftTotal('allowance') - draftTotal('deduction');

  // 급여대장처럼 한눈에 보이게 — 항목명은 직원마다 직접 입력한 값이라, 이번 회차에 실제로
  // 쓰인 이름들의 합집합을 열(컬럼)로 펼친다 (인쇄/엑셀 출력과 동일한 방식). 전 직원이 0원인
  // 항목은 열에서 빼서 표를 보기 좋게 만든다.
  const allowanceOrder: string[] = [];
  const deductionOrder: string[] = [];
  const columnSumByName = new Map<string, number>();
  for (const p of payslips) {
    for (const item of p.items) {
      if (item.category === 'allowance' && !allowanceOrder.includes(item.name)) allowanceOrder.push(item.name);
      if (item.category === 'deduction' && !deductionOrder.includes(item.name)) deductionOrder.push(item.name);
      if (item.category === 'allowance' || item.category === 'deduction') {
        columnSumByName.set(item.name, (columnSumByName.get(item.name) || 0) + item.amount);
      }
    }
  }
  const allowanceColumns = allowanceOrder.filter(name => (columnSumByName.get(name) || 0) !== 0);
  const deductionColumns = deductionOrder.filter(name => (columnSumByName.get(name) || 0) !== 0);
  const amountByName = (p: EmployeePayslipWithDetails, category: EmployeeSalaryItemCategory, name: string) =>
    p.items.filter(i => i.category === category && i.name === name).reduce((sum, i) => sum + i.amount, 0);
  const sumColumn = (f: (p: EmployeePayslipWithDetails) => number) => payslips.reduce((sum, p) => sum + f(p), 0);
  const periodTotalGross = payslips.reduce((sum, p) => sum + p.base_amount + p.total_allowance, 0);
  const periodTotalDeduction = payslips.reduce((sum, p) => sum + p.total_deduction, 0);
  const periodTotalNet = payslips.reduce((sum, p) => sum + p.net_amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">지급 월</Label>
          <Input type="month" value={yearMonth} onChange={e => setYearMonth(e.target.value)} className="h-9 text-sm w-40" />
        </div>
        {currentPeriod && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">지급(예정)일</Label>
              <div className="flex items-center gap-1.5">
                <Input
                  type="date" value={paymentDateInput} onChange={e => setPaymentDateInput(e.target.value)}
                  className="h-9 text-sm w-36" disabled={!permissions.canEdit || savingPaymentDate}
                />
                {permissions.canEdit && paymentDateInput !== (currentPeriod.payment_date || '') && (
                  <Button size="sm" className="h-9" onClick={handleSavePaymentDate} disabled={savingPaymentDate}>
                    {savingPaymentDate ? '저장 중...' : '저장'}
                  </Button>
                )}
              </div>
            </div>
            <Badge variant="outline" className={STATUS_COLORS[currentPeriod.status]}>
              {STATUS_LABELS[currentPeriod.status]}
            </Badge>
          </>
        )}
        <div className="flex-1" />
        {payslips.length > 0 && (
          <>
            <Button size="sm" variant="outline" className="gap-1.5 h-9" onClick={() => window.open(`/print/employee-payroll-ledger/${currentPeriod?.id}`, '_blank')}>
              <FileText className="w-3.5 h-3.5" />급여대장 인쇄
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5 h-9" onClick={handleExportExcel} disabled={exportingExcel}>
              <FileSpreadsheet className="w-3.5 h-3.5" />{exportingExcel ? '다운로드 중...' : '엑셀 다운로드'}
            </Button>
          </>
        )}
        {permissions.canCreate && isDraft && (
          <Button size="sm" variant="outline" className="gap-1.5 h-9" onClick={handleGenerate} disabled={generating || loading}>
            <RefreshCw className="w-3.5 h-3.5" />{generating ? '생성 중...' : '명세서 생성'}
          </Button>
        )}
        {permissions.canDelete && isDraft && payslips.length > 0 && (
          <Button size="sm" variant="outline" className="gap-1.5 h-9 text-red-600 border-red-300" onClick={handleCancelAll} disabled={cancelling || loading}>
            <Ban className="w-3.5 h-3.5" />{cancelling ? '취소 중...' : '명세서 취소'}
          </Button>
        )}
        {permissions.canEdit && isDraft && (
          <Button size="sm" className="gap-1.5 h-9" onClick={handleRequestAck} disabled={requestingAck || loading || payslips.length === 0}>
            <UserCheck className="w-3.5 h-3.5" />{requestingAck ? '요청 중...' : '직원 확인 요청'}
          </Button>
        )}
        {permissions.canEdit && isPendingAck && (
          <Button size="sm" className="gap-1.5 h-9" onClick={handleSubmitExpenseReport} disabled={submittingExpenseReport || !allAcked} title={!allAcked ? '아직 확인하지 않은 직원이 있습니다.' : undefined}>
            <Send className="w-3.5 h-3.5" />{submittingExpenseReport ? '상신 중...' : allAcked ? '지출결의서 상신' : `지출결의서 상신 (${payslips.filter(p => p.ack_status !== 'pending').length}/${payslips.length}명 확인)`}
          </Button>
        )}
        {isPendingApproval && currentPeriod?.approval_document_id && (
          <Button size="sm" variant="outline" className="gap-1.5 h-9" onClick={() => window.open(`/documents/${currentPeriod.approval_document_id}`, '_blank')}>
            <ExternalLink className="w-3.5 h-3.5" />결재 진행 상황 보기
          </Button>
        )}
        {permissions.canEdit && currentPeriod && currentPeriod.status !== 'draft' && (
          <Button size="sm" variant="outline" className="gap-1.5 h-9 text-amber-600 border-amber-300" onClick={handleReopen}>
            <Unlock className="w-3.5 h-3.5" />재오픈
          </Button>
        )}
      </div>

      {currentPeriod && currentPeriod.status !== 'draft' && payslips.length > 0 && (
        <PayslipAcknowledgmentStatus
          periodId={currentPeriod.id} refreshKey={ackRefreshKey}
          canForceApprove={currentUserRole === 'admin'}
          onChanged={refresh}
        />
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
      ) : payslips.length === 0 ? (
        <div className="text-center py-12 text-sm text-gray-400">
          이 달의 급여명세서가 없습니다. {isDraft && '"명세서 생성" 버튼으로 대상 직원 전원의 명세서를 만들 수 있습니다.'}
        </div>
      ) : (
        <div className="rounded-md border overflow-hidden overflow-x-auto">
          <table className="w-full text-xs whitespace-nowrap">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-2 font-medium text-gray-600">직원</th>
                <th className="text-right p-2 font-medium text-gray-600">기본급</th>
                {allowanceColumns.map(name => <th key={name} className="text-right p-2 font-medium text-gray-600">{name}</th>)}
                <th className="text-right p-2 font-medium text-gray-600 bg-blue-50/60">급여합계</th>
                {deductionColumns.map(name => <th key={name} className="text-right p-2 font-medium text-red-500">{name}</th>)}
                <th className="text-right p-2 font-medium text-red-600 bg-red-50/60">공제합계</th>
                <th className="text-right p-2 font-medium text-gray-600 bg-green-50/60">실지급액</th>
                <th className="text-right p-2 font-medium text-gray-600 w-36">작업</th>
              </tr>
            </thead>
            <tbody>
              {payslips.map(p => (
                <tr key={p.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => setViewingPayslip(p)}>
                  <td className="p-2">
                    <div className="font-medium">{p.employee_name}</div>
                    {p.employee_position_name && <div className="text-[10px] text-gray-400">{p.employee_position_name}</div>}
                  </td>
                  <td className="p-2 text-right font-mono">{fmt(p.base_amount)}</td>
                  {allowanceColumns.map(name => <td key={name} className="p-2 text-right font-mono">{fmt(amountByName(p, 'allowance', name))}</td>)}
                  <td className="p-2 text-right font-mono font-semibold bg-blue-50/60">{fmt(p.base_amount + p.total_allowance)}</td>
                  {deductionColumns.map(name => <td key={name} className="p-2 text-right font-mono text-red-600">{fmt(amountByName(p, 'deduction', name))}</td>)}
                  <td className="p-2 text-right font-mono font-semibold text-red-600 bg-red-50/60">{fmt(p.total_deduction)}</td>
                  <td className="p-2 text-right font-mono font-bold bg-green-50/60">{fmt(p.net_amount)}</td>
                  <td className="p-2 text-right" onClick={e => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      {permissions.canEdit && isDraft && (
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => openEditDialog(p)}>편집</Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1" onClick={() => window.open(`/print/employee-payslips/${p.id}`, '_blank')}>
                        <Printer className="w-3.5 h-3.5" />인쇄
                      </Button>
                      {permissions.canDelete && isDraft && (
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:text-red-600" onClick={() => handleRemovePayslip(p)}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t font-semibold">
                <td className="p-2">합계 ({payslips.length}명)</td>
                <td className="p-2 text-right font-mono">{fmt(sumColumn(p => p.base_amount))}</td>
                {allowanceColumns.map(name => <td key={name} className="p-2 text-right font-mono">{fmt(sumColumn(p => amountByName(p, 'allowance', name)))}</td>)}
                <td className="p-2 text-right font-mono bg-blue-50/60">{fmt(periodTotalGross)}</td>
                {deductionColumns.map(name => <td key={name} className="p-2 text-right font-mono text-red-600">{fmt(sumColumn(p => amountByName(p, 'deduction', name)))}</td>)}
                <td className="p-2 text-right font-mono text-red-600 bg-red-50/60">{fmt(periodTotalDeduction)}</td>
                <td className="p-2 text-right font-mono bg-green-50/60">{fmt(periodTotalNet)}</td>
                <td className="p-2" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {periods.length > 0 && (
        <div className="pt-2">
          <p className="text-xs text-gray-500 mb-1.5">지급 이력</p>
          <div className="flex flex-wrap gap-1.5">
            {periods.map(p => (
              <button
                key={p.id} type="button" onClick={() => setYearMonth(p.year_month)}
                className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${yearMonth === p.year_month ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
              >
                {p.year_month} · {STATUS_LABELS[p.status]} ({p.payslip_count}명)
              </button>
            ))}
          </div>
        </div>
      )}

      <Dialog open={!!editingPayslip} onOpenChange={o => !savingItems && !o && setEditingPayslip(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">{editingPayslip?.employee_name} — {currentPeriod?.year_month} 급여명세 편집</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {CATEGORIES.map(category => (
              <div key={category} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">{CATEGORY_LABELS[category]}</Label>
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-xs gap-1" onClick={() => addDraftItem(category)} disabled={savingItems}>
                    <Plus className="w-3 h-3" />추가
                  </Button>
                </div>
                {draftItems.filter(i => i.category === category).length === 0 ? (
                  <p className="text-xs text-gray-400 pl-1">항목 없음</p>
                ) : (
                  <div className="space-y-1.5">
                    {draftItems.filter(i => i.category === category).map(item => (
                      <div key={item.key} className="flex items-center gap-1.5">
                        <Input value={item.name} onChange={e => updateDraftItem(item.key, { name: e.target.value })} placeholder="항목명" className="h-8 text-sm flex-1" disabled={savingItems} />
                        <Input type="number" value={item.amount} onChange={e => updateDraftItem(item.key, { amount: e.target.value })} placeholder="금액" className="h-8 text-sm w-28" disabled={savingItems} />
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-400 hover:text-red-600" onClick={() => removeDraftItem(item.key)} disabled={savingItems}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div className="rounded-md border bg-blue-50 border-blue-200 px-3 py-2 flex items-center justify-between text-sm">
              <span className="font-medium text-blue-900">실지급액</span>
              <span className="font-bold font-mono text-blue-900">{fmt(draftNet)}원</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditingPayslip(null)} disabled={savingItems}>취소</Button>
            <Button size="sm" onClick={handleSaveItems} disabled={savingItems}>{savingItems ? '저장 중...' : '저장'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewingPayslip} onOpenChange={o => !o && setViewingPayslip(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">
              {viewingPayslip?.employee_name}{viewingPayslip?.employee_position_name ? ` · ${viewingPayslip.employee_position_name}` : ''} — {currentPeriod?.year_month} 급여명세서
            </DialogTitle>
          </DialogHeader>
          {viewingPayslip && (
            <div className="py-1">
              <EmployeePayslipDetailView payslip={viewingPayslip} showTitle={false} />
              <div className="flex justify-end gap-2 pt-3">
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => window.open(`/print/employee-payslips/${viewingPayslip.id}`, '_blank')}>
                  <Printer className="w-3.5 h-3.5" />인쇄
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
