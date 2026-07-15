import { useState, useEffect, useCallback } from 'react';
import { Printer, Lock, Unlock, RefreshCw, X, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { getCurrentUser } from '@/services/auth.service';
import {
  getPayrollPeriods,
  getOrCreatePayrollPeriod,
  getPayslipsForPeriod,
  generatePayslipsForPeriod,
  updatePayslipItems,
  deletePayslip,
  confirmPayrollPeriod,
  reopenPayrollPeriod,
} from '@/services/employee-salary.service';
import type { EmployeePayrollPeriod, EmployeePayrollPeriodSummary, EmployeePayslipItem, EmployeePayslipWithDetails, EmployeeSalaryItemCategory } from '@/types/employee-salary';

const CATEGORY_LABELS: Record<EmployeeSalaryItemCategory, string> = { base: '기본급', allowance: '수당', deduction: '공제' };
const CATEGORIES: EmployeeSalaryItemCategory[] = ['base', 'allowance', 'deduction'];
const fmt = (n: number) => n.toLocaleString('ko-KR');
const currentYearMonth = () => new Date().toISOString().slice(0, 7);

type DraftItem = { key: number; category: EmployeeSalaryItemCategory; name: string; amount: string };

// 월별 급여 지급 처리 — 급여 항목 관리 탭에서 입력한 "현재" 급여 항목을 스냅샷으로 생성해
// 명세서로 확정한다. 결재 연동 없이 관리자가 직접 확정 처리한다.
export default function EmployeePayrollPeriodsSection() {
  const { toast } = useToast();
  const permissions = usePermissions('employee_salary');

  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [periods, setPeriods] = useState<EmployeePayrollPeriodSummary[]>([]);
  const [currentPeriod, setCurrentPeriod] = useState<EmployeePayrollPeriod | null>(null);
  const [payslips, setPayslips] = useState<EmployeePayslipWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const [editingPayslip, setEditingPayslip] = useState<EmployeePayslipWithDetails | null>(null);
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [savingItems, setSavingItems] = useState(false);

  const loadPeriods = useCallback(() => { getPayrollPeriods().then(setPeriods); }, []);

  const loadPeriodAndPayslips = useCallback(async (ym: string) => {
    setLoading(true);
    try {
      const period = await getOrCreatePayrollPeriod(ym);
      setCurrentPeriod(period);
      setPayslips(await getPayslipsForPeriod(period.id));
    } catch (e) {
      toast({ title: '조회 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadPeriods(); }, [loadPeriods]);
  useEffect(() => { loadPeriodAndPayslips(yearMonth); }, [yearMonth, loadPeriodAndPayslips]);

  const refresh = async () => {
    if (!currentPeriod) return;
    setPayslips(await getPayslipsForPeriod(currentPeriod.id));
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

  const handleConfirm = async () => {
    if (!currentPeriod) return;
    if (payslips.length === 0) { toast({ title: '먼저 명세서를 생성해주세요.', variant: 'destructive' }); return; }
    if (!confirm(`${currentPeriod.year_month} 급여를 확정하시겠습니까? 확정 후에는 항목을 수정할 수 없습니다.`)) return;
    try {
      setConfirming(true);
      const user = await getCurrentUser();
      if (!user) return;
      await confirmPayrollPeriod(currentPeriod.id, user.id);
      toast({ title: '확정되었습니다.' });
      await loadPeriodAndPayslips(yearMonth);
      loadPeriods();
    } catch (e) {
      toast({ title: '확정 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setConfirming(false);
    }
  };

  const handleReopen = async () => {
    if (!currentPeriod) return;
    if (!confirm('확정을 취소하고 다시 편집 가능한 상태로 되돌리시겠습니까?')) return;
    try {
      await reopenPayrollPeriod(currentPeriod.id);
      toast({ title: '재오픈되었습니다.' });
      await loadPeriodAndPayslips(yearMonth);
      loadPeriods();
    } catch (e) {
      toast({ title: '실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
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
        draftItems.filter(i => i.category === category).map((i, idx) => ({ category, name: i.name.trim(), amount: Number(i.amount) || 0, display_order: idx }))
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

  const isDraft = currentPeriod?.status === 'draft';
  const draftTotal = (category: EmployeeSalaryItemCategory) => draftItems.filter(i => i.category === category).reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
  const draftNet = draftTotal('base') + draftTotal('allowance') - draftTotal('deduction');
  const periodTotalNet = payslips.reduce((sum, p) => sum + p.net_amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">지급 월</Label>
          <Input type="month" value={yearMonth} onChange={e => setYearMonth(e.target.value)} className="h-9 text-sm w-40" />
        </div>
        {currentPeriod && (
          <Badge variant="outline" className={isDraft ? 'bg-yellow-50 text-yellow-700 border-yellow-200' : 'bg-green-50 text-green-700 border-green-200'}>
            {isDraft ? '작성중' : '확정됨'}
          </Badge>
        )}
        <div className="flex-1" />
        {permissions.canCreate && isDraft && (
          <Button size="sm" variant="outline" className="gap-1.5 h-9" onClick={handleGenerate} disabled={generating || loading}>
            <RefreshCw className="w-3.5 h-3.5" />{generating ? '생성 중...' : '명세서 생성'}
          </Button>
        )}
        {permissions.canEdit && isDraft && (
          <Button size="sm" className="gap-1.5 h-9" onClick={handleConfirm} disabled={confirming || loading}>
            <Lock className="w-3.5 h-3.5" />{confirming ? '확정 중...' : '지급 확정'}
          </Button>
        )}
        {permissions.canEdit && !isDraft && (
          <Button size="sm" variant="outline" className="gap-1.5 h-9 text-amber-600 border-amber-300" onClick={handleReopen}>
            <Unlock className="w-3.5 h-3.5" />재오픈
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
      ) : payslips.length === 0 ? (
        <div className="text-center py-12 text-sm text-gray-400">
          이 달의 급여명세서가 없습니다. {isDraft && '"명세서 생성" 버튼으로 대상 직원 전원의 명세서를 만들 수 있습니다.'}
        </div>
      ) : (
        <div className="rounded-md border overflow-hidden overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-2 text-xs font-medium text-gray-600">직원</th>
                <th className="text-right p-2 text-xs font-medium text-gray-600">기본급</th>
                <th className="text-right p-2 text-xs font-medium text-gray-600">수당</th>
                <th className="text-right p-2 text-xs font-medium text-gray-600">공제</th>
                <th className="text-right p-2 text-xs font-medium text-gray-600">실지급액</th>
                <th className="text-right p-2 text-xs font-medium text-gray-600 w-40">작업</th>
              </tr>
            </thead>
            <tbody>
              {payslips.map(p => (
                <tr key={p.id} className="border-b hover:bg-gray-50">
                  <td className="p-2">
                    <div className="font-medium">{p.employee_name}</div>
                    {p.employee_position_name && <div className="text-xs text-gray-400">{p.employee_position_name}</div>}
                  </td>
                  <td className="p-2 text-right font-mono">{fmt(p.base_amount)}</td>
                  <td className="p-2 text-right font-mono">{fmt(p.total_allowance)}</td>
                  <td className="p-2 text-right font-mono text-red-600">{fmt(p.total_deduction)}</td>
                  <td className="p-2 text-right font-mono font-semibold">{fmt(p.net_amount)}</td>
                  <td className="p-2 text-right">
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
                <td className="p-2" colSpan={4}>합계 ({payslips.length}명)</td>
                <td className="p-2 text-right font-mono">{fmt(periodTotalNet)}</td>
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
                {p.year_month} {p.status === 'confirmed' ? '· 확정' : '· 작성중'} ({p.payslip_count}명)
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
    </div>
  );
}
