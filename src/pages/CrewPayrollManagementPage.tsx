import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Printer, RefreshCw, FileSpreadsheet, Send, ExternalLink, Trash2, Wallet, CheckCircle2, Eye, History, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { getCurrentUser, getShips } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { getEffectiveTemplateForShip, getSalaryComponents } from '@/lib/salary-store';
import { getRanks } from '@/services/rank.service';
import { supervisorService } from '@/services/supervisor.service';
import { crewPayrollService } from '@/services/crew-payroll.service';
import { sickPayService } from '@/services/sick-pay.service';
import { exportCrewPayrollLedgerToExcel } from '@/utils/crew-payroll-export';
import CrewPayslipDetailView from '@/components/crew-payroll/CrewPayslipDetailView';
import SalaryTemplateMatrixTable from '@/components/salary/SalaryTemplateMatrixTable';
import type { Ship } from '@/lib/store';
import type { SalaryTemplateWithItems, SalaryComponent } from '@/lib/salary-store';
import type { Rank } from '@/types/models';
import type { CrewPayrollPeriod, CrewPayrollPeriodSummary, CrewPayslipWithDetails, CrewPayrollHistoryRow, CrewPayslipItem, CrewDeferredPayHistoryRow } from '@/types/crew-payroll';
import type { CrewSickPayLedgerRow } from '@/types/sick-pay';

const STATUS_LABELS: Record<string, string> = { draft: 'Draft', pending_approval: 'Pending Approval', confirmed: 'Confirmed' };
const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  pending_approval: 'bg-purple-50 text-purple-700 border-purple-200',
  confirmed: 'bg-green-50 text-green-700 border-green-200',
};
const fmt = (n: number) => n.toLocaleString('en-US');
const fmtMD = (d: string) => d?.slice(5).replace('-', '/') || '';
// period_start_date/end_date는 승선일~월초, 하선일~월말 중 늦은/이른 날로 이미 잘려 있어서,
// 1일에 승선했거나 말일에 하선한 경우엔 그것만으로 "이번 달에 승선/하선했는지"를 계속
// 승선/재직 중인 선원과 구분할 수 없다 — actual_embark_date/actual_disembark_date(승선기록의
// 잘리지 않은 실제 날짜)가 이 페이로드의 달과 같은 달인지로 판정한다.
const embarkedThisMonth = (p: { period_start_date: string; actual_embark_date?: string | null }) =>
  p.actual_embark_date ? p.actual_embark_date.slice(0, 7) === p.period_start_date.slice(0, 7) : Number(p.period_start_date.slice(8, 10)) !== 1;
const disembarkedThisMonth = (p: { period_end_date: string; actual_disembark_date?: string | null }) =>
  !!p.actual_disembark_date && p.actual_disembark_date.slice(0, 7) === p.period_end_date.slice(0, 7);
const currentYearMonth = () => new Date().toISOString().slice(0, 7);

// 선박별 선원 급여명세 — 담당 선박의 급여 템플릿(직급+등급)과 선원 계약별 수당/공제를
// 승선일수 기준 일할계산으로 합쳐 월별 명세서를 자동 생성하고, 지출결의서로 결재 상신한다.
// 선주/매닝사와 공유되는 화면이라 표시 문구는 전부 영어로 유지한다.
export default function CrewPayrollManagementPage() {
  const { toast } = useToast();
  const permissions = usePermissions('crew_payroll');
  const [searchParams] = useSearchParams();

  const [ships, setShips] = useState<Ship[]>([]);
  const [owners, setOwners] = useState<{ id: string; name: string }[]>([]);
  const [fleets, setFleets] = useState<{ id: string; name: string }[]>([]);
  const [ownerId, setOwnerId] = useState('');
  const [fleetId, setFleetId] = useState('');
  const [shipId, setShipId] = useState(() => searchParams.get('shipId') || '');
  const [yearMonth, setYearMonth] = useState(() => searchParams.get('yearMonth') || currentYearMonth());
  const [periods, setPeriods] = useState<CrewPayrollPeriodSummary[]>([]);
  const [currentPeriod, setCurrentPeriod] = useState<CrewPayrollPeriod | null>(null);
  const [payslips, setPayslips] = useState<CrewPayslipWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [viewingPayslip, setViewingPayslip] = useState<CrewPayslipWithDetails | null>(null);
  const [template, setTemplate] = useState<SalaryTemplateWithItems | null>(null);
  const [components, setComponents] = useState<SalaryComponent[]>([]);
  const [ranks, setRanks] = useState<Rank[]>([]);

  // 급여대장 표 안에서 바로 금액을 고쳐 쓰는 인라인 편집 — 클릭한 셀 하나만 입력 상태가 되고,
  // 바뀐 값이 하나라도 있으면 상단에 저장 버튼이 뜬다(저장 전까지는 로컬에만 보관).
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [cellDrafts, setCellDrafts] = useState<Record<string, string>>({});
  const [savingCells, setSavingCells] = useState(false);

  // 직급/이름을 클릭하면 그 선원의 선박 이력 전체를 급여대장 형태(월별 행 + 상태)로 보여준다.
  const [historyCrew, setHistoryCrew] = useState<{ crewMemberId: string; crewName: string; rankCode: string; rankGrade: string | null; embarkDate?: string | null; disembarkDate?: string | null } | null>(null);
  const [historyRows, setHistoryRows] = useState<CrewPayrollHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Deferred Pay 구간의 행을 클릭하면 그 항목이 매달 얼마씩 적립되어 최종 Settlement 금액이
  // 됐는지 월별로 보여준다.
  const [viewingDeferredPayout, setViewingDeferredPayout] = useState<{ crewName: string; rankCode: string; itemName: string; settlementAmount: number } | null>(null);
  const [deferredPayoutHistory, setDeferredPayoutHistory] = useState<CrewDeferredPayHistoryRow[]>([]);
  const [deferredPayoutHistoryLoading, setDeferredPayoutHistoryLoading] = useState(false);

  // 상병급여 구간의 행을 클릭하면 그 케이스가 매달 얼마씩 지급되는지 보여준다.
  const [viewingSickPayRow, setViewingSickPayRow] = useState<CrewSickPayLedgerRow | null>(null);
  const [sickPayRowEntries, setSickPayRowEntries] = useState<{ year_month: string; amount: number; confirmed: boolean }[]>([]);
  const [sickPayRowEntriesLoading, setSickPayRowEntriesLoading] = useState(false);

  // 상병(질병/부상) 하선 선원의 급여 — 선원 급여대장 자체에는 들어가지 않지만, 이 선박·이 달에
  // 청구해야 할 상병급여가 있으면 급여대장 말미에 별도 안내로 보여주고 그 자리에서 수정/종결한다.
  const [sickPayRows, setSickPayRows] = useState<CrewSickPayLedgerRow[]>([]);
  const [sickPayDrafts, setSickPayDrafts] = useState<Record<string, string>>({});
  const [closeDateDrafts, setCloseDateDrafts] = useState<Record<string, string>>({});
  const [sickPaySaving, setSickPaySaving] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const user = await getCurrentUser();
      const isAdmin = user?.role === 'admin' || user?.role === 'system_admin';
      const allShips = await getShips();
      let scopedShips = allShips;
      if (!isAdmin && user) {
        const supervisedIds = new Set(await supervisorService.getSupervisedShips(user.id));
        scopedShips = allShips.filter(s => supervisedIds.has(s.id));
      }
      setShips(scopedShips);

      const ownerIds = [...new Set(scopedShips.map(s => s.owner_id).filter((v): v is string => !!v))];
      const fleetIds = [...new Set(scopedShips.map(s => s.fleet_id).filter((v): v is string => !!v))];
      const [{ data: ownerRows }, { data: fleetRows }] = await Promise.all([
        ownerIds.length > 0 ? supabase.from('companies').select('id, name').in('id', ownerIds).order('name') : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        fleetIds.length > 0 ? supabase.from('fleets').select('id, name').in('id', fleetIds).order('name') : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      ]);
      setOwners(ownerRows || []);
      setFleets(fleetRows || []);
      const [comps, rankList] = await Promise.all([getSalaryComponents(), getRanks()]);
      setComponents(comps);
      setRanks(rankList);

      const presetShipId = searchParams.get('shipId');
      if (presetShipId) {
        const presetShip = scopedShips.find(s => s.id === presetShipId);
        if (presetShip) { setOwnerId(presetShip.owner_id || ''); setFleetId(presetShip.fleet_id || ''); }
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOwnerChange = (id: string) => { setOwnerId(id); setFleetId(''); setShipId(''); };
  const handleFleetChange = (id: string) => { setFleetId(id); setShipId(''); };

  const fleetsForOwner = ownerId ? fleets.filter(f => ships.some(s => s.owner_id === ownerId && s.fleet_id === f.id)) : [];
  const shipsForSelection = ships.filter(s => (!ownerId || s.owner_id === ownerId) && (!fleetId || s.fleet_id === fleetId));

  const loadPeriods = useCallback(async (sid: string) => {
    if (!sid) { setPeriods([]); return; }
    setPeriods(await crewPayrollService.getPayrollPeriods(sid));
  }, []);

  useEffect(() => { loadPeriods(shipId); }, [shipId, loadPeriods]);

  useEffect(() => {
    if (!shipId) { setTemplate(null); return; }
    getEffectiveTemplateForShip(shipId).then(setTemplate);
  }, [shipId]);

  const loadPayslips = useCallback(async (sid: string, ym: string) => {
    if (!sid) { setCurrentPeriod(null); setPayslips([]); return; }
    setLoading(true);
    try {
      const list = await crewPayrollService.getPayrollPeriods(sid);
      const period = list.find(p => p.year_month === ym) || null;
      setCurrentPeriod(period);
      setPayslips(period ? await crewPayrollService.getPayslipsForPeriod(period.id) : []);
    } catch (e) {
      toast({ title: 'Failed to load', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadPayslips(shipId, yearMonth); }, [shipId, yearMonth, loadPayslips]);

  const loadSickPay = useCallback(async (sid: string, ym: string) => {
    if (!sid) { setSickPayRows([]); return; }
    setSickPayRows(await sickPayService.getSickPayForShipMonth(sid, ym));
  }, []);

  useEffect(() => { loadSickPay(shipId, yearMonth); }, [shipId, yearMonth, loadSickPay]);

  const handleSaveSickPayAmount = async (row: CrewSickPayLedgerRow) => {
    const draft = sickPayDrafts[row.id];
    if (draft === undefined) return;
    const amount = Number(draft);
    if (Number.isNaN(amount)) return;
    setSickPaySaving(row.id);
    try {
      await sickPayService.upsertMonthlyEntry(row.id, yearMonth, amount);
      setSickPayDrafts(prev => { const next = { ...prev }; delete next[row.id]; return next; });
      await loadSickPay(shipId, yearMonth);
    } catch (e) {
      toast({ title: 'Failed to save sick pay amount', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setSickPaySaving(null);
    }
  };

  const handleCloseSickPay = async (row: CrewSickPayLedgerRow) => {
    const closedDate = closeDateDrafts[row.id] || new Date().toISOString().slice(0, 10);
    if (!confirm(`${row.crew_name}의 상병급여를 ${closedDate}자로 종결하시겠습니까? 다음 달부터는 급여대장에 나타나지 않습니다.`)) return;
    setSickPaySaving(row.id);
    try {
      await sickPayService.closeSickPayRecord(row.id, closedDate);
      await loadSickPay(shipId, yearMonth);
    } catch (e) {
      toast({ title: 'Failed to close sick pay case', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setSickPaySaving(null);
    }
  };

  const refresh = async () => {
    await loadPayslips(shipId, yearMonth);
    await loadPeriods(shipId);
  };

  const handleGenerate = async () => {
    if (!shipId) { toast({ title: 'Please select a vessel first', variant: 'destructive' }); return; }
    try {
      setGenerating(true);
      const user = await getCurrentUser();
      if (!user) return;
      if (currentPeriod) {
        await crewPayrollService.regeneratePayrollPeriod(currentPeriod.id, user.id);
        toast({ title: 'Regenerated successfully.' });
      } else {
        await crewPayrollService.createPayrollPeriod(shipId, yearMonth, user.id);
        toast({ title: 'Payslips generated.' });
      }
      await refresh();
    } catch (e) {
      toast({ title: 'Generation failed', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const handleDeletePeriod = async () => {
    if (!currentPeriod) return;
    if (!confirm(`Delete the ${yearMonth} payroll period? All generated payslips will be removed.`)) return;
    try {
      await crewPayrollService.deletePayrollPeriod(currentPeriod.id);
      toast({ title: 'Deleted.' });
      await refresh();
    } catch (e) {
      toast({ title: 'Delete failed', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    }
  };

  const handleSubmit = async () => {
    if (!currentPeriod) return;
    if (!confirm(`Submit the ${yearMonth} payroll ledger as an expense report for approval?`)) return;
    try {
      setSubmitting(true);
      const user = await getCurrentUser();
      if (!user) return;
      await crewPayrollService.submitPayrollForApproval(currentPeriod.id, user.id);
      toast({ title: 'Expense report submitted.' });
      await refresh();
    } catch (e) {
      toast({ title: 'Submission failed', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirm = async () => {
    if (!currentPeriod) return;
    if (!confirm(`Confirm the ${yearMonth} payroll? (This finalizes it directly, without an approval workflow.)`)) return;
    try {
      setConfirming(true);
      const user = await getCurrentUser();
      if (!user) return;
      await crewPayrollService.confirmPayrollPeriod(currentPeriod.id, user.id);
      toast({ title: 'Confirmed.' });
      await refresh();
    } catch (e) {
      toast({ title: 'Confirmation failed', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setConfirming(false);
    }
  };

  const handleExportExcel = async () => {
    if (!currentPeriod) return;
    try {
      setExporting(true);
      const ledger = await crewPayrollService.getPayrollLedgerForPeriod(currentPeriod.id);
      if (!ledger || ledger.rows.length === 0) { toast({ title: 'No payslips to download.', variant: 'destructive' }); return; }
      await exportCrewPayrollLedgerToExcel(ledger, payslips);
    } catch (e) {
      toast({ title: 'Excel download failed', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  const startCellEdit = (itemId: string, currentAmount: number) => {
    setEditingItemId(itemId);
    setCellDrafts(prev => (itemId in prev ? prev : { ...prev, [itemId]: String(currentAmount) }));
  };

  const itemById = new Map(payslips.flatMap(p => p.items.map(i => [i.id, i] as const)));
  const hasCellChanges = Object.entries(cellDrafts).some(([id, v]) => {
    const item = itemById.get(id);
    return item && Number(v) !== item.amount && v.trim() !== '';
  });

  const handleSaveCells = async () => {
    setSavingCells(true);
    try {
      const changed = Object.entries(cellDrafts).filter(([id, v]) => {
        const item = itemById.get(id);
        return item && v.trim() !== '' && !Number.isNaN(Number(v)) && Number(v) !== item.amount;
      });
      for (const [id, v] of changed) {
        await crewPayrollService.updatePayslipItemAmount(id, Number(v));
      }
      toast({ title: `Saved (${changed.length} item${changed.length === 1 ? '' : 's'} updated).` });
      setCellDrafts({});
      setEditingItemId(null);
      await refresh();
    } catch (e) {
      toast({ title: 'Save failed', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setSavingCells(false);
    }
  };

  const handleDiscardCells = () => {
    setCellDrafts({});
    setEditingItemId(null);
  };

  const openCrewHistory = async (p: CrewPayslipWithDetails) => {
    setHistoryCrew({
      crewMemberId: p.crew_member_id, crewName: p.crew_name,
      rankCode: p.rank_code, rankGrade: p.rank_grade,
      embarkDate: p.actual_embark_date, disembarkDate: p.actual_disembark_date,
    });
    setHistoryLoading(true);
    try {
      setHistoryRows(await crewPayrollService.getCrewPayrollHistory(p.crew_member_id));
    } finally {
      setHistoryLoading(false);
    }
  };

  const openDeferredPayoutHistory = async (payslip: CrewPayslipWithDetails, item: CrewPayslipItem) => {
    const baseName = item.name.replace(/\s*\(Lump Sum\)\s*$/, '');
    setViewingDeferredPayout({ crewName: payslip.crew_name, rankCode: payslip.rank_code, itemName: baseName, settlementAmount: item.amount });
    setDeferredPayoutHistoryLoading(true);
    try {
      setDeferredPayoutHistory(await crewPayrollService.getCrewDeferredPayHistory(payslip.crew_member_id, baseName));
    } finally {
      setDeferredPayoutHistoryLoading(false);
    }
  };

  const openSickPayRowHistory = async (row: CrewSickPayLedgerRow) => {
    setViewingSickPayRow(row);
    setSickPayRowEntriesLoading(true);
    try {
      setSickPayRowEntries(await sickPayService.getMonthlyEntriesForRecord(row));
    } finally {
      setSickPayRowEntriesLoading(false);
    }
  };

  const periodStatus = currentPeriod?.status ?? 'draft';
  const isDraft = periodStatus === 'draft';
  const isPendingApproval = periodStatus === 'pending_approval';

  // 급여대장은 급여 구성항목(BW/OT/OA/LP 등)과 계약별 수당을 "기본급" 한 칸으로 뭉치지 않고
  // 항목명별 열로 모두 펼친다 — 이번 회차에 실제로 쓰인 급여/공제 항목명의 합집합을 열로 만든다
  // (items는 display_order 순이라 급여 구성항목이 계약 수당보다 항상 앞선 열에 온다).
  // 후불성 항목은 부분월(승선 중)에 "정상 어닝"(예: BW) + "공제 X (Deferred)" 쌍으로
  // 나타나 Total Earnings/Total Deductions 양쪽에 그 관계가 투명하게 보이게 한다(net_amount
  // 에는 서로 상쇄돼 영향 없음, 기존과 동일). 내부 추적 전용인 "X (Accrued)"(deferred_accrual)
  // 항목은 이미 위 두 항목이 같은 정보를 보여주므로 급여대장 열에는 중복 노출하지 않는다.
  // 하선월 일괄지급(Lump Sum) 항목도 그 자체가 누적 적립액과 같은 값이라 열로 노출하면
  // 결국 적립액을 보여주는 셈이 되므로 급여대장에서는 뺀다(net_amount 계산에는 그대로 포함).
  const allowanceOrder: string[] = [];
  const deductionOrder: string[] = [];
  for (const p of payslips) {
    for (const item of p.items) {
      if (item.payment_type === 'deferred_payout' || item.payment_type === 'deferred_accrual') continue;
      if (item.category === 'earning' && !allowanceOrder.includes(item.name)) allowanceOrder.push(item.name);
      if (item.category === 'deduction' && !deductionOrder.includes(item.name)) deductionOrder.push(item.name);
    }
  }
  const findItem = (p: CrewPayslipWithDetails, name: string, deduction: boolean) =>
    p.items.find(i => (deduction ? i.category === 'deduction' : i.category === 'earning') && i.name === name);
  // 아직 저장하지 않은 draft 입력값이 있으면 그 값을, 없으면 저장된 금액을 쓴다 — 항목 셀뿐
  // 아니라 Total Earnings/Deductions/Net Pay, 하단 합계까지 전부 이 값 기준으로 다시 계산해야
  // 편집 중인 내용이 바로 합계에 반영된다(저장 서버 로직 updatePayslipItemAmount와 동일 기준).
  const effectiveAmount = (item: CrewPayslipItem) => {
    const draft = cellDrafts[item.id];
    return draft !== undefined && draft.trim() !== '' && !Number.isNaN(Number(draft)) ? Number(draft) : item.amount;
  };
  const amountByName = (p: CrewPayslipWithDetails, name: string, deduction: boolean) => {
    const item = findItem(p, name, deduction);
    return item ? effectiveAmount(item) : 0;
  };
  const sumColumn = (f: (p: CrewPayslipWithDetails) => number) => payslips.reduce((sum, p) => sum + f(p), 0);
  const computeRowTotals = (p: CrewPayslipWithDetails) => {
    const base = p.items.filter(i => i.source === 'template' && i.category === 'earning' && i.payment_type !== 'deferred_accrual' && i.payment_type !== 'deferred_payout').reduce((s, i) => s + effectiveAmount(i), 0);
    const allowance = p.items.filter(i => i.category === 'earning' && i.source === 'contract' && i.payment_method !== 'owner_billed').reduce((s, i) => s + effectiveAmount(i), 0);
    const deduction = p.items.filter(i => i.category === 'deduction').reduce((s, i) => s + effectiveAmount(i), 0);
    return { gross: base + allowance, deduction, net: base + allowance - deduction };
  };

  // 항목/합계 셀에 마우스를 올리면 어떻게 그 금액이 나왔는지 보여주는 네이티브 title 툴팁 —
  // 이 화면 다른 곳(선박명, Pay Period)에서도 이미 title로 호버 설명을 쓰는 관례를 따른다.
  const buildItemCalcTitle = (p: CrewPayslipWithDetails, item: CrewPayslipItem) => {
    const calculated = Math.round(item.standard_amount * (p.days_served / (p.days_in_month || 1)));
    const actual = effectiveAmount(item);
    let text = `${fmt(item.standard_amount)} × ${p.days_served}/${p.days_in_month} days = ${fmt(calculated)}`;
    if (actual !== calculated) {
      text += actual === 0 && calculated > 0 ? ' (waived this partial month)' : ` (manually adjusted to ${fmt(actual)})`;
    }
    return text;
  };
  const buildGrossTitle = (p: CrewPayslipWithDetails) => {
    const items = p.items.filter(i =>
      (i.source === 'template' && i.category === 'earning' && i.payment_type !== 'deferred_accrual' && i.payment_type !== 'deferred_payout') ||
      (i.category === 'earning' && i.source === 'contract' && i.payment_method !== 'owner_billed')
    );
    const lines = items.map(i => `${i.name}: ${fmt(effectiveAmount(i))}`);
    return [...lines, `= GROSS ${fmt(computeRowTotals(p).gross)}`].join('\n');
  };
  const buildDeductTitle = (p: CrewPayslipWithDetails) => {
    const items = p.items.filter(i => i.category === 'deduction');
    const lines = items.map(i => `${i.name}: ${fmt(effectiveAmount(i))}`);
    return [...lines, `= DEDUCT ${fmt(computeRowTotals(p).deduction)}`].join('\n');
  };
  const buildNetTitle = (p: CrewPayslipWithDetails) => {
    const t = computeRowTotals(p);
    return `${fmt(t.gross)} (GROSS) − ${fmt(t.deduction)} (DEDUCT) = ${fmt(t.net)} (Net Pay)`;
  };

  // 인라인 편집 가능한 금액 셀 — draft 상태에서만 클릭해 고칠 수 있고, 편집 중에도 Total
  // Earnings/Deductions/Net Pay와 하단 합계까지 바로 반영된다(computeRowTotals 참고).
  const renderAmountCell = (p: CrewPayslipWithDetails, name: string, deduction: boolean, isFirst = false) => {
    const item = findItem(p, name, deduction);
    const editable = !!item && isDraft && permissions.canEdit;
    const dividerClass = isFirst ? 'border-l' : '';
    if (!editable) {
      return <td key={name} className={`p-2 text-right font-mono ${deduction ? 'text-red-600' : ''} ${dividerClass}`} title={item ? buildItemCalcTitle(p, item) : undefined}>{fmt(amountByName(p, name, deduction))}</td>;
    }
    const draftValue = cellDrafts[item.id];
    if (editingItemId === item.id) {
      return (
        <td key={name} className={`py-1 px-2 text-right ${dividerClass}`} onClick={e => e.stopPropagation()}>
          <Input
            type="number" autoFocus
            className="h-6 text-xs w-20 text-right ml-auto px-1"
            value={draftValue ?? String(item.amount)}
            onChange={e => setCellDrafts(prev => ({ ...prev, [item.id]: e.target.value }))}
            onFocus={e => e.target.select()}
            onBlur={() => setEditingItemId(null)}
            onKeyDown={e => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') {
                setCellDrafts(prev => { const next = { ...prev }; delete next[item.id]; return next; });
                setEditingItemId(null);
              }
            }}
          />
        </td>
      );
    }
    const displayValue = effectiveAmount(item);
    return (
      <td key={name} className={`py-1 px-2 text-right ${dividerClass}`} onClick={e => e.stopPropagation()}>
        <span
          className={`font-mono cursor-text px-1 rounded hover:bg-amber-50 ${deduction ? 'text-red-600' : ''} ${draftValue !== undefined ? 'bg-amber-50 ring-1 ring-amber-300' : ''}`}
          onClick={() => startCellEdit(item.id, item.amount)}
          title={buildItemCalcTitle(p, item)}
        >
          {fmt(displayValue)}
        </span>
      </td>
    );
  };
  const totalGross = payslips.reduce((sum, p) => sum + computeRowTotals(p).gross, 0);
  const totalDeduction = payslips.reduce((sum, p) => sum + computeRowTotals(p).deduction, 0);
  const totalNet = payslips.reduce((sum, p) => sum + computeRowTotals(p).net, 0);

  // Payment History는 회차가 쌓일수록 무한정 늘어나던 걸 막기 위해 현재 선택된 달 기준
  // 앞뒤로 3개월(총 최대 7개)만 보여준다 — 더 먼 과거/미래 달은 상단의 월 선택 입력으로
  // 바로 이동할 수 있으니(이 목록은 그 주변 빠른 이동용일 뿐) 잘려도 접근성엔 문제없다.
  const monthDiff = (a: string, b: string) => {
    const [ay, am] = a.split('-').map(Number);
    const [by, bm] = b.split('-').map(Number);
    return (ay - by) * 12 + (am - bm);
  };
  const nearbyPeriods = periods
    .filter(p => Math.abs(monthDiff(p.year_month, yearMonth)) <= 3)
    .sort((a, b) => a.year_month.localeCompare(b.year_month));

  // 하선월의 후불성 급여 일괄지급(Lump Sum)은 이 급여대장(net_amount)에는 포함되지 않고
  // 급여와는 별도로 정산된다 — 상병급여와 같은 방식으로, 이번 회차에 하선한 선원의 정산 대상
  // 금액을 놓치지 않도록 별도 구간에 안내한다. payslips에 이미 포함된 항목이라 별도 조회 없이
  // 그대로 뽑아 쓴다.
  const deferredPayoutRows = payslips.flatMap(p =>
    p.items.filter(i => i.payment_type === 'deferred_payout').map(item => ({ payslip: p, item }))
  );

  // Deferred Pay 표는 선원 1명당 한 줄로 펼치고, 항목명(LP/C/C/B 등)을 헤더 컬럼으로 삼는다 —
  // (payslip, item) 쌍 하나가 한 줄이던 것을 선원별로 묶고 항목명별 열로 피벗한다.
  const deferredPayColumns: string[] = [];
  for (const { item } of deferredPayoutRows) {
    const base = item.name.replace(/\s*\(Lump Sum\)\s*$/, '');
    if (!deferredPayColumns.includes(base)) deferredPayColumns.push(base);
  }
  const deferredPayByCrew = (() => {
    const map = new Map<string, { payslip: typeof payslips[number]; itemsByColumn: Record<string, typeof deferredPayoutRows[number]['item']> }>();
    for (const { payslip, item } of deferredPayoutRows) {
      const base = item.name.replace(/\s*\(Lump Sum\)\s*$/, '');
      const entry = map.get(payslip.id) || { payslip, itemsByColumn: {} };
      entry.itemsByColumn[base] = item;
      map.set(payslip.id, entry);
    }
    return [...map.values()];
  })();
  const deferredPayColumnTotals = deferredPayColumns.map(col =>
    deferredPayByCrew.reduce((sum, r) => sum + (r.itemsByColumn[col]?.amount || 0), 0)
  );
  const deferredPayGrandTotal = deferredPayColumnTotals.reduce((s, v) => s + v, 0);

  // 이력 다이얼로그도 급여대장과 동일하게 항목명별 열을 펼친다 — 월마다 적용 템플릿이
  // 달라질 수 있어 전체 이력에 등장한 항목명의 합집합을 열로 만든다.
  const historyAllowanceColumns = useMemo(() => {
    const cols: string[] = [];
    for (const r of historyRows) for (const name of Object.keys(r.allowance_by_name)) if (!cols.includes(name)) cols.push(name);
    return cols;
  }, [historyRows]);
  const historyDeductionColumns = useMemo(() => {
    const cols: string[] = [];
    for (const r of historyRows) for (const name of Object.keys(r.deduction_by_name)) if (!cols.includes(name)) cols.push(name);
    return cols;
  }, [historyRows]);
  const historyTotals = useMemo(() => ({
    allowanceByName: historyAllowanceColumns.reduce((acc, name) => { acc[name] = historyRows.reduce((s, r) => s + (r.allowance_by_name[name] || 0), 0); return acc; }, {} as Record<string, number>),
    deductionByName: historyDeductionColumns.reduce((acc, name) => { acc[name] = historyRows.reduce((s, r) => s + (r.deduction_by_name[name] || 0), 0); return acc; }, {} as Record<string, number>),
    gross: historyRows.reduce((s, r) => s + r.gross_amount, 0),
    deduction: historyRows.reduce((s, r) => s + r.total_deduction, 0),
    net: historyRows.reduce((s, r) => s + r.net_amount, 0),
  }), [historyRows, historyAllowanceColumns, historyDeductionColumns]);

  return (
    <div className="max-w-[1600px] mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><Wallet className="w-5 h-5 text-muted-foreground" />Crew Payroll</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Combines the vessel&apos;s salary template with each crew member&apos;s contract allowances/deductions, pro-rated by days served, into a monthly payroll ledger you can submit for approval.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Owner</Label>
          <Select value={ownerId || '_none'} onValueChange={v => handleOwnerChange(v === '_none' ? '' : v)}>
            <SelectTrigger className="h-7 text-xs w-40"><SelectValue placeholder="Select owner" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">Select owner</SelectItem>
              {owners.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Fleet</Label>
          <Select value={fleetId || '_none'} onValueChange={v => handleFleetChange(v === '_none' ? '' : v)} disabled={!ownerId}>
            <SelectTrigger className="h-7 text-xs w-40"><SelectValue placeholder="All" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">All</SelectItem>
              {fleetsForOwner.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Vessel</Label>
          <Select value={shipId || '_none'} onValueChange={v => setShipId(v === '_none' ? '' : v)} disabled={!ownerId}>
            <SelectTrigger className="h-7 text-xs w-48"><SelectValue placeholder="Select vessel" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">Select vessel</SelectItem>
              {shipsForSelection.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Pay Month</Label>
          <Input type="month" value={yearMonth} onChange={e => setYearMonth(e.target.value)} className="h-7 text-xs w-40" />
        </div>
        <Badge variant="outline" className={STATUS_COLORS[periodStatus]}>{STATUS_LABELS[periodStatus]}</Badge>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {payslips.length > 0 && (
          <>
            <Button size="sm" variant="outline" className="gap-1.5 h-7" onClick={() => window.open(`/print/crew-payroll/${currentPeriod?.id}`, '_blank')}>
              <Printer className="w-3.5 h-3.5" />Print Ledger
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5 h-7" onClick={handleExportExcel} disabled={exporting}>
              <FileSpreadsheet className="w-3.5 h-3.5" />{exporting ? 'Downloading...' : 'Download Excel'}
            </Button>
          </>
        )}
        {permissions.canCreate && isDraft && shipId && (
          <Button size="sm" variant="outline" className="gap-1.5 h-7" onClick={handleGenerate} disabled={generating || loading}>
            <RefreshCw className="w-3.5 h-3.5" />{generating ? 'Generating...' : currentPeriod ? 'Regenerate' : 'Generate Payslips'}
          </Button>
        )}
        {permissions.canDelete && isDraft && currentPeriod && (
          <Button size="sm" variant="outline" className="gap-1.5 h-7 text-red-600 border-red-300" onClick={handleDeletePeriod}>
            <Trash2 className="w-3.5 h-3.5" />Delete Period
          </Button>
        )}
        {permissions.canEdit && isDraft && currentPeriod && payslips.length > 0 && (
          <Button size="sm" className="gap-1.5 h-7" onClick={handleConfirm} disabled={confirming}>
            <CheckCircle2 className="w-3.5 h-3.5" />{confirming ? 'Confirming...' : 'Confirm'}
          </Button>
        )}
        {isPendingApproval && currentPeriod?.approval_document_id && (
          <Button size="sm" variant="outline" className="gap-1.5 h-7" onClick={() => window.open(`/documents/${currentPeriod.approval_document_id}`, '_blank')}>
            <ExternalLink className="w-3.5 h-3.5" />View Approval Status
          </Button>
        )}
      </div>

      {hasCellChanges && (
        <div className="flex items-center justify-between gap-2 bg-blue-50 border border-blue-200 rounded-md px-4 py-2">
          <span className="text-xs font-medium text-blue-800">Unsaved changes to one or more amounts.</span>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1 bg-white" onClick={handleDiscardCells} disabled={savingCells}>
              <X className="w-3.5 h-3.5" />Discard
            </Button>
            <Button size="sm" className="h-7 text-xs gap-1" onClick={handleSaveCells} disabled={savingCells}>
              <Save className="w-3.5 h-3.5" />{savingCells ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      )}

      {!shipId ? (
        <div className="text-center py-12 text-sm text-gray-400">Please select a vessel first.</div>
      ) : loading ? (
        <div className="flex items-center justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
      ) : payslips.length === 0 ? (
        <div className="text-center py-12 text-sm text-gray-400">
          No payslips for this month yet. {isDraft && 'Use "Generate Payslips" to create payslips for every crew member on this vessel.'}
        </div>
      ) : (
        <div className="rounded-md border overflow-hidden overflow-x-auto">
          <table className="w-full text-xs whitespace-nowrap">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th rowSpan={2} className="text-left p-2 font-medium text-gray-600">Rank</th>
                <th rowSpan={2} className="text-left p-2 font-medium text-gray-600">Name</th>
                <th rowSpan={2} className="text-center p-2 font-medium text-gray-600">Pay Period</th>
                <th rowSpan={2} className="text-center p-2 font-medium text-gray-600">Days</th>
                <th colSpan={allowanceOrder.length + 1} className="text-center py-1 text-[10px] font-semibold text-blue-700 bg-blue-50/60 border-l">Earnings</th>
                <th colSpan={deductionOrder.length + 1} className="text-center py-1 text-[10px] font-semibold text-red-600 bg-red-50/60 border-l">Deductions</th>
                <th rowSpan={2} className="text-right p-2 font-medium text-gray-600 bg-green-50/60 border-l">Net Pay</th>
                <th rowSpan={2} className="text-right p-2 font-medium text-gray-600 w-36">Actions</th>
              </tr>
              <tr>
                {allowanceOrder.map((name, i) => (
                  <th key={name} className={`text-right p-2 font-medium text-gray-600 ${i === 0 ? 'border-l' : ''}`}>{name}</th>
                ))}
                <th className="text-right p-2 font-medium text-gray-600 bg-blue-50/60">GROSS</th>
                {deductionOrder.map((name, i) => <th key={name} className={`text-right p-2 font-medium text-red-500 ${i === 0 ? 'border-l' : ''}`}>{name}</th>)}
                <th className="text-right p-2 font-medium text-red-600 bg-red-50/60">DEDUCT</th>
              </tr>
            </thead>
            <tbody>
              {payslips.map(p => {
                const rowTotals = computeRowTotals(p);
                return (
                <tr key={p.id} className="border-b hover:bg-gray-50">
                  <td className="py-1 px-2 text-gray-600 cursor-pointer hover:underline hover:text-blue-700" onClick={() => openCrewHistory(p)}>
                    {p.rank_code}{p.rank_grade ? `(${p.rank_grade})` : ''}
                  </td>
                  <td className="py-1 px-2 font-medium cursor-pointer hover:underline hover:text-blue-700" onClick={() => openCrewHistory(p)}>
                    <span className="inline-flex items-center gap-1">
                      {p.crew_name}
                      {embarkedThisMonth(p) && <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 leading-4 bg-blue-50 text-blue-700 border-blue-200">Sign On</Badge>}
                      {disembarkedThisMonth(p) && <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 leading-4 bg-orange-50 text-orange-700 border-orange-200">Sign Off</Badge>}
                    </span>
                  </td>
                  <td className="py-1 px-2 text-center text-gray-500" title={`${p.period_start_date} ~ ${p.period_end_date}`}>
                    {fmtMD(p.period_start_date)}~{fmtMD(p.period_end_date)}
                  </td>
                  <td className="py-1 px-2 text-center text-gray-500">{p.days_served}/{p.days_in_month}</td>
                  {allowanceOrder.map((name, i) => renderAmountCell(p, name, false, i === 0))}
                  <td className="py-1 px-2 text-right font-mono font-semibold bg-blue-50/60" title={buildGrossTitle(p)}>{fmt(rowTotals.gross)}</td>
                  {deductionOrder.map((name, i) => renderAmountCell(p, name, true, i === 0))}
                  <td className="py-1 px-2 text-right font-mono font-semibold text-red-600 bg-red-50/60" title={buildDeductTitle(p)}>{fmt(rowTotals.deduction)}</td>
                  <td className="py-1 px-2 text-right font-mono font-bold bg-green-50/60 border-l" title={buildNetTitle(p)}>{fmt(rowTotals.net)}</td>
                  <td className="py-1 px-2 text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1" onClick={() => setViewingPayslip(p)}>
                        <Eye className="w-3.5 h-3.5" />View
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1" onClick={() => window.open(`/print/crew-payslips/${p.id}`, '_blank')}>
                        <Printer className="w-3.5 h-3.5" />Print
                      </Button>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t font-semibold">
                <td className="py-1 px-2" colSpan={4}>Total ({payslips.length} crew)</td>
                {allowanceOrder.map((name, i) => <td key={name} className={`py-1 px-2 text-right font-mono ${i === 0 ? 'border-l' : ''}`}>{fmt(sumColumn(p => amountByName(p, name, false)))}</td>)}
                <td className="py-1 px-2 text-right font-mono bg-blue-50/60" title={`Sum of GROSS across ${payslips.length} crew`}>{fmt(totalGross)}</td>
                {deductionOrder.map((name, i) => <td key={name} className={`py-1 px-2 text-right font-mono text-red-600 ${i === 0 ? 'border-l' : ''}`}>{fmt(sumColumn(p => amountByName(p, name, true)))}</td>)}
                <td className="py-1 px-2 text-right font-mono text-red-600 bg-red-50/60" title={`Sum of DEDUCT across ${payslips.length} crew`}>{fmt(totalDeduction)}</td>
                <td className="py-1 px-2 text-right font-mono bg-green-50/60 border-l" title={`${fmt(totalGross)} (GROSS) − ${fmt(totalDeduction)} (DEDUCT) = ${fmt(totalNet)} (Net Pay)`}>{fmt(totalNet)}</td>
                <td className="py-1 px-2" />
              </tr>
            </tfoot>
          </table>
          {/* 하선월 후불성 급여 일괄지급은 net_amount에서 빠지므로(급여와는 별도 정산), 상병급여와
              같은 방식으로 이번 회차에 하선한 선원의 정산 대상 금액을 놓치지 않게 안내한다. */}
          {deferredPayoutRows.length > 0 && (
            <div className="px-2 py-3 border-t">
              <p className="text-xs font-semibold text-amber-700 mb-1.5">⚠ Deferred Pay — sign-off crew this month, settled separately (not included in Net Pay)</p>
              <div className="rounded-md border border-amber-200 overflow-hidden overflow-x-auto">
                <table className="w-full text-xs whitespace-nowrap">
                  <thead className="bg-amber-50 border-b border-amber-200">
                    <tr>
                      <th className="text-left py-1 px-2 font-medium text-amber-700">Rank</th>
                      <th className="text-left py-1 px-2 font-medium text-amber-700">Name</th>
                      {deferredPayColumns.map(col => (
                        <th key={col} className="text-right py-1 px-2 font-medium text-amber-700">{col}</th>
                      ))}
                      <th className="text-right py-1 px-2 font-medium text-amber-700">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deferredPayByCrew.map(({ payslip, itemsByColumn }) => {
                      const rowTotal = deferredPayColumns.reduce((s, col) => s + (itemsByColumn[col]?.amount || 0), 0);
                      return (
                        <tr key={payslip.id} className="border-b border-amber-100">
                          <td className="py-1 px-2 text-gray-600">{payslip.rank_code}</td>
                          <td className="py-1 px-2 font-medium">{payslip.crew_name}</td>
                          {deferredPayColumns.map(col => {
                            const item = itemsByColumn[col];
                            return (
                              <td
                                key={col}
                                className={`py-1 px-2 text-right font-mono ${item ? 'cursor-pointer hover:bg-amber-50' : 'text-gray-300'}`}
                                onClick={() => item && openDeferredPayoutHistory(payslip, item)}
                              >
                                {item ? fmt(item.amount) : '-'}
                              </td>
                            );
                          })}
                          <td className="py-1 px-2 text-right font-mono font-semibold">{fmt(rowTotal)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-amber-50 border-t border-amber-200">
                    <tr>
                      <td colSpan={2} className="py-1 px-2 text-right font-semibold text-amber-700">Total</td>
                      {deferredPayColumnTotals.map((total, i) => (
                        <td key={deferredPayColumns[i]} className="py-1 px-2 text-right font-mono font-semibold text-amber-700">{fmt(total)}</td>
                      ))}
                      <td className="py-1 px-2 text-right font-mono font-semibold text-amber-700">{fmt(deferredPayGrandTotal)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
          {/* 상병급여는 선원 급여대장(crew_payslips)에는 들어가지 않지만, 이 선박·이 달에 청구해야
              할 상병급여가 있으면 놓치지 않도록 대장 바로 아래(적용 템플릿보다 위)에 안내한다. */}
          {sickPayRows.length > 0 && (
            <div className="px-2 py-3 border-t">
              <p className="text-xs font-semibold text-red-700 mb-1.5">⚠ Sick Pay — claim separately for this month</p>
              <div className="rounded-md border border-red-200 overflow-hidden overflow-x-auto">
                <table className="w-full text-xs whitespace-nowrap">
                  <thead className="bg-red-50 border-b border-red-200">
                    <tr>
                      <th className="text-left py-1 px-2 font-medium text-red-700">Rank</th>
                      <th className="text-left py-1 px-2 font-medium text-red-700">Name</th>
                      <th className="text-center py-1 px-2 font-medium text-red-700">Sign-Off Date</th>
                      <th className="text-center py-1 px-2 font-medium text-red-700">Sick Pay Since</th>
                      <th className="text-center py-1 px-2 font-medium text-red-700">Status</th>
                      <th className="text-right py-1 px-2 font-medium text-red-700">This Month Amount</th>
                      <th className="text-center py-1 px-2 font-medium text-red-700 w-56">Close Case</th>
                      <th className="text-center py-1 px-2 font-medium text-red-700 w-16">Monthly</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sickPayRows.map(row => (
                      <tr key={row.id} className="border-b border-red-100">
                        <td className="py-1 px-2 text-gray-600">{row.rank_code}</td>
                        <td className="py-1 px-2 font-medium">{row.crew_name}</td>
                        <td className="py-1 px-2 text-center text-gray-500">{row.disembark_date}</td>
                        <td className="py-1 px-2 text-center text-gray-500">{row.start_date}</td>
                        <td className="py-1 px-2 text-center">
                          {row.status === 'closed'
                            ? <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200">Closed{row.closed_date ? ` ${row.closed_date}` : ''}</Badge>
                            : <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">Active</Badge>}
                        </td>
                        <td className="py-1 px-2 text-right">
                          <Input
                            type="number"
                            value={sickPayDrafts[row.id] ?? String(row.this_month_amount)}
                            onChange={e => setSickPayDrafts(prev => ({ ...prev, [row.id]: e.target.value }))}
                            onBlur={() => handleSaveSickPayAmount(row)}
                            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                            disabled={sickPaySaving === row.id}
                            className="h-6 text-xs w-24 text-right ml-auto"
                          />
                        </td>
                        <td className="py-1 px-2">
                          {row.status === 'closed' ? (
                            <p className="text-center text-[11px] text-gray-400">Already closed</p>
                          ) : (
                            <div className="flex items-center justify-center gap-1">
                              <Input
                                type="date"
                                value={closeDateDrafts[row.id] ?? new Date().toISOString().slice(0, 10)}
                                onChange={e => setCloseDateDrafts(prev => ({ ...prev, [row.id]: e.target.value }))}
                                className="h-6 text-xs w-32"
                              />
                              <Button size="sm" variant="outline" className="h-6 text-[11px] text-red-600 border-red-300" onClick={() => handleCloseSickPay(row)} disabled={sickPaySaving === row.id}>
                                Close
                              </Button>
                            </div>
                          )}
                        </td>
                        <td className="py-1 px-2 text-center">
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="Monthly breakdown" onClick={() => openSickPayRowHistory(row)}>
                            <History className="w-3.5 h-3.5 text-muted-foreground" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {template && (
            <div className="px-2 py-3 border-t bg-gray-50 space-y-1.5">
              <p className="text-xs text-gray-500">Salary Template Applied: <span className="text-gray-700 font-medium">{template.name}</span></p>
              <SalaryTemplateMatrixTable template={template} components={components} ranks={ranks} lang="en" />
            </div>
          )}
        </div>
      )}

      {periods.length > 0 && (
        <div className="pt-2">
          <p className="text-xs text-gray-500 mb-1.5">Payment History</p>
          <div className="flex flex-wrap gap-1.5">
            {nearbyPeriods.map(p => (
              <button
                key={p.id} type="button" onClick={() => setYearMonth(p.year_month)}
                className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${yearMonth === p.year_month ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
              >
                {p.year_month} · {STATUS_LABELS[p.status]} ({p.payslip_count} crew)
              </button>
            ))}
          </div>
        </div>
      )}

      <Dialog open={!!historyCrew} onOpenChange={o => !o && setHistoryCrew(null)}>
        <DialogContent className="max-w-6xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-1.5">
              <History className="w-4 h-4 text-muted-foreground" />
              {historyCrew?.rankCode}{historyCrew?.rankGrade ? `(${historyCrew.rankGrade})` : ''} {historyCrew?.crewName} — Payroll History
            </DialogTitle>
            <p className="text-xs text-gray-500 pl-6">
              Sign on: {historyCrew?.embarkDate || '-'} · Sign off: {historyCrew?.disembarkDate || 'present'}
            </p>
          </DialogHeader>
          {historyLoading ? (
            <div className="flex items-center justify-center py-10"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" /></div>
          ) : historyRows.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No payroll history found for this crew member.</p>
          ) : (
            <div className="rounded-md border overflow-hidden overflow-x-auto">
              <table className="w-full text-xs whitespace-nowrap">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left p-2 font-medium text-gray-600">Month</th>
                    <th className="text-left p-2 font-medium text-gray-600">Vessel</th>
                    <th className="text-left p-2 font-medium text-gray-600">Status</th>
                    <th className="text-left p-2 font-medium text-gray-600">Pay Period</th>
                    <th className="text-left p-2 font-medium text-gray-600">Days</th>
                    {historyAllowanceColumns.map((name, i) => <th key={name} className={`text-right p-2 font-medium text-gray-600 ${i === 0 ? 'border-l' : ''}`}>{name}</th>)}
                    <th className="text-right p-2 font-medium text-gray-700 bg-gray-100">GROSS</th>
                    {historyDeductionColumns.map((name, i) => <th key={name} className={`text-right p-2 font-medium text-red-600 ${i === 0 ? 'border-l' : ''}`}>{name}</th>)}
                    <th className="text-right p-2 font-medium text-red-700 bg-gray-100">DEDUCT</th>
                    <th className="text-right p-2 font-medium text-gray-700 bg-gray-100 border-l">Net Pay</th>
                  </tr>
                </thead>
                <tbody>
                  {historyRows.map(r => (
                    <tr key={r.period_id} className="border-b">
                      <td className="py-1 px-2">{r.year_month}</td>
                      <td className="py-1 px-2 text-gray-600">{r.ship_name}</td>
                      <td className="py-1 px-2"><Badge variant="outline" className={`text-[11px] ${STATUS_COLORS[r.status]}`}>{STATUS_LABELS[r.status]}</Badge></td>
                      <td className="py-1 px-2 text-gray-600">{r.period_start_date}~{r.period_end_date}</td>
                      <td className="py-1 px-2 text-gray-600">{r.days_served}/{r.days_in_month}</td>
                      {historyAllowanceColumns.map((name, i) => <td key={name} className={`py-1 px-2 text-right font-mono ${i === 0 ? 'border-l' : ''}`}>{fmt(r.allowance_by_name[name] || 0)}</td>)}
                      <td className="py-1 px-2 text-right font-mono font-semibold bg-gray-50">{fmt(r.gross_amount)}</td>
                      {historyDeductionColumns.map((name, i) => <td key={name} className={`py-1 px-2 text-right font-mono text-red-600 ${i === 0 ? 'border-l' : ''}`}>{fmt(r.deduction_by_name[name] || 0)}</td>)}
                      <td className="py-1 px-2 text-right font-mono font-semibold text-red-600 bg-gray-50">{fmt(r.total_deduction)}</td>
                      <td className="py-1 px-2 text-right font-mono font-semibold bg-gray-50 border-l">{fmt(r.net_amount)}</td>
                    </tr>
                  ))}
                  {/* (Accrued) 열은 월별 적립액만 표기 대상이라 합산하면 곧 누적 적립 총액이 되어버린다 —
                      급여대장에는 총적립액을 노출하지 않기로 했으므로 합계 칸은 비워둔다. */}
                  <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                    <td className="py-1 px-2" colSpan={5}>Total ({historyRows.length} months)</td>
                    {historyAllowanceColumns.map((name, i) => (
                      <td key={name} className={`py-1 px-2 text-right font-mono ${i === 0 ? 'border-l' : ''}`}>
                        {name.endsWith('(Accrued)') ? <span className="text-gray-300">-</span> : fmt(historyTotals.allowanceByName[name] || 0)}
                      </td>
                    ))}
                    <td className="py-1 px-2 text-right font-mono">{fmt(historyTotals.gross)}</td>
                    {historyDeductionColumns.map((name, i) => <td key={name} className={`py-1 px-2 text-right font-mono text-red-600 ${i === 0 ? 'border-l' : ''}`}>{fmt(historyTotals.deductionByName[name] || 0)}</td>)}
                    <td className="py-1 px-2 text-right font-mono text-red-600">{fmt(historyTotals.deduction)}</td>
                    <td className="py-1 px-2 text-right font-mono border-l">{fmt(historyTotals.net)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewingPayslip} onOpenChange={o => !o && setViewingPayslip(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">
              {viewingPayslip?.crew_name}{viewingPayslip?.rank_code ? ` · ${viewingPayslip.rank_code}${viewingPayslip.rank_grade ? `(${viewingPayslip.rank_grade})` : ''}` : ''} — {yearMonth} Payslip
            </DialogTitle>
          </DialogHeader>
          {viewingPayslip && (
            <div className="py-1">
              <CrewPayslipDetailView payslip={viewingPayslip} shipName={ships.find(s => s.id === shipId)?.name} showTitle={false} />
              <div className="flex justify-end gap-2 pt-3">
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => window.open(`/print/crew-payslips/${viewingPayslip.id}`, '_blank')}>
                  <Printer className="w-3.5 h-3.5" />Print
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewingDeferredPayout} onOpenChange={o => !o && setViewingDeferredPayout(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-1.5">
              <History className="w-4 h-4 text-muted-foreground" />
              {viewingDeferredPayout?.rankCode} {viewingDeferredPayout?.crewName} — {viewingDeferredPayout?.itemName} Deferred Pay Breakdown
            </DialogTitle>
          </DialogHeader>
          {deferredPayoutHistoryLoading ? (
            <div className="flex items-center justify-center py-10"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" /></div>
          ) : deferredPayoutHistory.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No accrual history found.</p>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left p-2 font-medium text-gray-600">Month</th>
                    <th className="text-left p-2 font-medium text-gray-600">Vessel</th>
                    <th className="text-right p-2 font-medium text-gray-600">Monthly Accrual</th>
                    <th className="text-right p-2 font-medium text-gray-600">Cumulative Balance</th>
                    <th className="text-right p-2 font-medium text-gray-600">Settled</th>
                  </tr>
                </thead>
                <tbody>
                  {deferredPayoutHistory.map(r => (
                    <tr key={r.period_id} className={`border-b ${r.payout_this_month > 0 ? 'bg-amber-50' : ''}`}>
                      <td className="p-2">{r.year_month}</td>
                      <td className="p-2 text-gray-600">{r.ship_name}</td>
                      <td className="p-2 text-right font-mono">{fmt(r.monthly_accrual)}</td>
                      <td className="p-2 text-right font-mono">{r.payout_this_month > 0 ? <span className="text-gray-300">-</span> : fmt(r.accrued_to_date)}</td>
                      <td className="p-2 text-right font-mono font-semibold text-amber-700">{r.payout_this_month > 0 ? fmt(r.payout_this_month) : '-'}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-semibold">
                    <td className="p-2" colSpan={4}>Settlement Amount</td>
                    <td className="p-2 text-right font-mono text-amber-700">{fmt(viewingDeferredPayout?.settlementAmount ?? 0)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewingSickPayRow} onOpenChange={o => !o && setViewingSickPayRow(null)}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-1.5">
              <History className="w-4 h-4 text-muted-foreground" />
              {viewingSickPayRow?.rank_code} {viewingSickPayRow?.crew_name} — Sick Pay Monthly Breakdown
            </DialogTitle>
          </DialogHeader>
          {sickPayRowEntriesLoading ? (
            <div className="flex items-center justify-center py-10"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" /></div>
          ) : sickPayRowEntries.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No monthly entries found.</p>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left p-2 font-medium text-gray-600">Month</th>
                    <th className="text-center p-2 font-medium text-gray-600">Status</th>
                    <th className="text-right p-2 font-medium text-gray-600">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {sickPayRowEntries.map(e => (
                    <tr key={e.year_month} className={`border-b ${e.confirmed ? '' : 'text-gray-400'}`}>
                      <td className="p-2">{e.year_month}</td>
                      <td className="p-2 text-center">
                        {e.confirmed
                          ? <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200">Confirmed</Badge>
                          : <Badge variant="outline" className="text-[10px] bg-gray-50 text-gray-400 border-gray-200">Unconfirmed (calc.)</Badge>}
                      </td>
                      <td className="p-2 text-right font-mono">{fmt(e.amount)}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-semibold">
                    <td className="p-2" colSpan={2}>Total ({sickPayRowEntries.length} months)</td>
                    <td className="p-2 text-right font-mono">{fmt(sickPayRowEntries.reduce((s, e) => s + e.amount, 0))}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
