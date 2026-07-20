import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Printer, RefreshCw, FileSpreadsheet, Send, ExternalLink, Trash2, Wallet, CheckCircle2 } from 'lucide-react';
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
import { supervisorService } from '@/services/supervisor.service';
import { crewPayrollService } from '@/services/crew-payroll.service';
import { exportCrewPayrollLedgerToExcel } from '@/utils/crew-payroll-export';
import CrewPayslipDetailView from '@/components/crew-payroll/CrewPayslipDetailView';
import type { Ship } from '@/lib/store';
import type { CrewPayrollPeriod, CrewPayrollPeriodSummary, CrewPayslipWithDetails } from '@/types/crew-payroll';

const STATUS_LABELS: Record<string, string> = { draft: '작성중', pending_approval: '결재 진행중', confirmed: '확정됨' };
const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  pending_approval: 'bg-purple-50 text-purple-700 border-purple-200',
  confirmed: 'bg-green-50 text-green-700 border-green-200',
};
const fmt = (n: number) => n.toLocaleString('ko-KR');
const currentYearMonth = () => new Date().toISOString().slice(0, 7);

// 선박별 선원 급여명세 — 담당 선박의 급여 템플릿(직급+등급)과 선원 계약별 수당/공제를
// 승선일수 기준 일할계산으로 합쳐 월별 명세서를 자동 생성하고, 지출결의서로 결재 상신한다.
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

  const [editingPayslip, setEditingPayslip] = useState<CrewPayslipWithDetails | null>(null);
  const [draftAmounts, setDraftAmounts] = useState<Record<string, string>>({});
  const [savingItems, setSavingItems] = useState(false);
  const [viewingPayslip, setViewingPayslip] = useState<CrewPayslipWithDetails | null>(null);

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

  const loadPayslips = useCallback(async (sid: string, ym: string) => {
    if (!sid) { setCurrentPeriod(null); setPayslips([]); return; }
    setLoading(true);
    try {
      const list = await crewPayrollService.getPayrollPeriods(sid);
      const period = list.find(p => p.year_month === ym) || null;
      setCurrentPeriod(period);
      setPayslips(period ? await crewPayrollService.getPayslipsForPeriod(period.id) : []);
    } catch (e) {
      toast({ title: '조회 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadPayslips(shipId, yearMonth); }, [shipId, yearMonth, loadPayslips]);

  const refresh = async () => {
    await loadPayslips(shipId, yearMonth);
    await loadPeriods(shipId);
  };

  const handleGenerate = async () => {
    if (!shipId) { toast({ title: '선박을 먼저 선택하세요', variant: 'destructive' }); return; }
    try {
      setGenerating(true);
      const user = await getCurrentUser();
      if (!user) return;
      if (currentPeriod) {
        await crewPayrollService.regeneratePayrollPeriod(currentPeriod.id, user.id);
        toast({ title: '다시 생성되었습니다.' });
      } else {
        await crewPayrollService.createPayrollPeriod(shipId, yearMonth, user.id);
        toast({ title: '명세서가 생성되었습니다.' });
      }
      await refresh();
    } catch (e) {
      toast({ title: '생성 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const handleDeletePeriod = async () => {
    if (!currentPeriod) return;
    if (!confirm(`${yearMonth} 회차를 삭제하시겠습니까? 생성된 명세서가 모두 사라집니다.`)) return;
    try {
      await crewPayrollService.deletePayrollPeriod(currentPeriod.id);
      toast({ title: '삭제되었습니다.' });
      await refresh();
    } catch (e) {
      toast({ title: '삭제 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    }
  };

  const handleSubmit = async () => {
    if (!currentPeriod) return;
    if (!confirm(`${yearMonth} 급여명세표를 지출결의서로 결재 상신하시겠습니까?`)) return;
    try {
      setSubmitting(true);
      const user = await getCurrentUser();
      if (!user) return;
      await crewPayrollService.submitPayrollForApproval(currentPeriod.id, user.id);
      toast({ title: '지출결의서를 상신했습니다.' });
      await refresh();
    } catch (e) {
      toast({ title: '상신 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirm = async () => {
    if (!currentPeriod) return;
    if (!confirm(`${yearMonth} 급여명세를 확정 처리하시겠습니까? (결재 없이 바로 확정됩니다)`)) return;
    try {
      setConfirming(true);
      const user = await getCurrentUser();
      if (!user) return;
      await crewPayrollService.confirmPayrollPeriod(currentPeriod.id, user.id);
      toast({ title: '확정 처리되었습니다.' });
      await refresh();
    } catch (e) {
      toast({ title: '확정 처리 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setConfirming(false);
    }
  };

  const handleExportExcel = async () => {
    if (!currentPeriod) return;
    try {
      setExporting(true);
      const ledger = await crewPayrollService.getPayrollLedgerForPeriod(currentPeriod.id);
      if (!ledger || ledger.rows.length === 0) { toast({ title: '내려받을 명세서가 없습니다.', variant: 'destructive' }); return; }
      await exportCrewPayrollLedgerToExcel(ledger);
    } catch (e) {
      toast({ title: '엑셀 다운로드 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  const openEditDialog = (payslip: CrewPayslipWithDetails) => {
    setEditingPayslip(payslip);
    setDraftAmounts(Object.fromEntries(payslip.items.map(i => [i.id, String(i.amount)])));
  };

  const handleSaveItems = async () => {
    if (!editingPayslip) return;
    try {
      setSavingItems(true);
      for (const item of editingPayslip.items) {
        const next = Number(draftAmounts[item.id]);
        if (!Number.isNaN(next) && next !== item.amount) {
          await crewPayrollService.updatePayslipItemAmount(item.id, next);
        }
      }
      toast({ title: '저장되었습니다.' });
      setEditingPayslip(null);
      await refresh();
    } catch (e) {
      toast({ title: '저장 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setSavingItems(false);
    }
  };

  const periodStatus = currentPeriod?.status ?? 'draft';
  const isDraft = periodStatus === 'draft';
  const isPendingApproval = periodStatus === 'pending_approval';

  // 급여명세표처럼 한눈에 — 이번 회차에 실제로 쓰인 수당/공제 항목명의 합집합을 열로 펼친다.
  const allowanceOrder: string[] = [];
  const deductionOrder: string[] = [];
  for (const p of payslips) {
    for (const item of p.items) {
      if (item.category === 'earning' && item.source === 'contract' && !allowanceOrder.includes(item.name)) allowanceOrder.push(item.name);
      if (item.category === 'deduction' && !deductionOrder.includes(item.name)) deductionOrder.push(item.name);
    }
  }
  const amountByName = (p: CrewPayslipWithDetails, name: string, deduction: boolean) =>
    p.items.filter(i => (deduction ? i.category === 'deduction' : i.category === 'earning' && i.source === 'contract') && i.name === name)
      .reduce((sum, i) => sum + i.amount, 0);
  const sumColumn = (f: (p: CrewPayslipWithDetails) => number) => payslips.reduce((sum, p) => sum + f(p), 0);
  const totalGross = payslips.reduce((sum, p) => sum + p.base_amount + p.total_allowance, 0);
  const totalDeduction = payslips.reduce((sum, p) => sum + p.total_deduction, 0);
  const totalNet = payslips.reduce((sum, p) => sum + p.net_amount, 0);

  return (
    <div className="max-w-[1600px] mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><Wallet className="w-5 h-5 text-muted-foreground" />선원 급여명세</h1>
        <p className="text-xs text-muted-foreground mt-1">
          선박에 배정된 급여 템플릿과 선원 계약별 수당/공제를 승선일수 기준으로 합쳐 월별 명세서를 만들고, 지출결의서로 결재 상신합니다.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">선주</Label>
          <Select value={ownerId || '_none'} onValueChange={v => handleOwnerChange(v === '_none' ? '' : v)}>
            <SelectTrigger className="h-9 text-sm w-40"><SelectValue placeholder="선주 선택" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">선주 선택</SelectItem>
              {owners.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">플릿</Label>
          <Select value={fleetId || '_none'} onValueChange={v => handleFleetChange(v === '_none' ? '' : v)} disabled={!ownerId}>
            <SelectTrigger className="h-9 text-sm w-40"><SelectValue placeholder="전체" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">전체</SelectItem>
              {fleetsForOwner.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">선박</Label>
          <Select value={shipId || '_none'} onValueChange={v => setShipId(v === '_none' ? '' : v)} disabled={!ownerId}>
            <SelectTrigger className="h-9 text-sm w-48"><SelectValue placeholder="선박 선택" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">선박 선택</SelectItem>
              {shipsForSelection.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">급여 월</Label>
          <Input type="month" value={yearMonth} onChange={e => setYearMonth(e.target.value)} className="h-9 text-sm w-40" />
        </div>
        <Badge variant="outline" className={STATUS_COLORS[periodStatus]}>{STATUS_LABELS[periodStatus]}</Badge>
        <div className="flex-1" />
        {payslips.length > 0 && (
          <>
            <Button size="sm" variant="outline" className="gap-1.5 h-9" onClick={() => window.open(`/print/crew-payroll/${currentPeriod?.id}`, '_blank')}>
              <Printer className="w-3.5 h-3.5" />급여명세표 인쇄
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5 h-9" onClick={handleExportExcel} disabled={exporting}>
              <FileSpreadsheet className="w-3.5 h-3.5" />{exporting ? '다운로드 중...' : '엑셀 다운로드'}
            </Button>
          </>
        )}
        {permissions.canCreate && isDraft && shipId && (
          <Button size="sm" variant="outline" className="gap-1.5 h-9" onClick={handleGenerate} disabled={generating || loading}>
            <RefreshCw className="w-3.5 h-3.5" />{generating ? '생성 중...' : currentPeriod ? '다시 생성' : '명세서 생성'}
          </Button>
        )}
        {permissions.canDelete && isDraft && currentPeriod && (
          <Button size="sm" variant="outline" className="gap-1.5 h-9 text-red-600 border-red-300" onClick={handleDeletePeriod}>
            <Trash2 className="w-3.5 h-3.5" />회차 삭제
          </Button>
        )}
        {permissions.canEdit && isDraft && currentPeriod && payslips.length > 0 && (
          <Button size="sm" variant="outline" className="gap-1.5 h-9 text-purple-600 border-purple-300" onClick={handleSubmit} disabled={submitting}>
            <Send className="w-3.5 h-3.5" />{submitting ? '상신 중...' : '지출결의서 상신'}
          </Button>
        )}
        {permissions.canEdit && isDraft && currentPeriod && payslips.length > 0 && (
          <Button size="sm" className="gap-1.5 h-9" onClick={handleConfirm} disabled={confirming}>
            <CheckCircle2 className="w-3.5 h-3.5" />{confirming ? '처리 중...' : '확정 처리'}
          </Button>
        )}
        {isPendingApproval && currentPeriod?.approval_document_id && (
          <Button size="sm" variant="outline" className="gap-1.5 h-9" onClick={() => window.open(`/documents/${currentPeriod.approval_document_id}`, '_blank')}>
            <ExternalLink className="w-3.5 h-3.5" />결재 진행 상황 보기
          </Button>
        )}
      </div>

      {!shipId ? (
        <div className="text-center py-12 text-sm text-gray-400">담당 선박을 먼저 선택하세요.</div>
      ) : loading ? (
        <div className="flex items-center justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
      ) : payslips.length === 0 ? (
        <div className="text-center py-12 text-sm text-gray-400">
          이 달의 급여명세서가 없습니다. {isDraft && '"명세서 생성" 버튼으로 이 선박에 승선한 선원 전원의 명세서를 만들 수 있습니다.'}
        </div>
      ) : (
        <div className="rounded-md border overflow-hidden overflow-x-auto">
          <table className="w-full text-xs whitespace-nowrap">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-2 font-medium text-gray-600">선원</th>
                <th className="text-center p-2 font-medium text-gray-600">근무일</th>
                <th className="text-right p-2 font-medium text-gray-600">기본급</th>
                {allowanceOrder.map(name => <th key={name} className="text-right p-2 font-medium text-gray-600">{name}</th>)}
                <th className="text-right p-2 font-medium text-gray-600 bg-blue-50/60">급여합계</th>
                {deductionOrder.map(name => <th key={name} className="text-right p-2 font-medium text-red-500">{name}</th>)}
                <th className="text-right p-2 font-medium text-red-600 bg-red-50/60">공제합계</th>
                <th className="text-right p-2 font-medium text-gray-600 bg-green-50/60">실지급액</th>
                <th className="text-right p-2 font-medium text-gray-600 w-36">작업</th>
              </tr>
            </thead>
            <tbody>
              {payslips.map(p => (
                <tr key={p.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => setViewingPayslip(p)}>
                  <td className="p-2">
                    <div className="font-medium">{p.crew_name}</div>
                    <div className="text-[10px] text-gray-400">{p.rank_code}{p.rank_grade ? `(${p.rank_grade})` : ''}</div>
                  </td>
                  <td className="p-2 text-center text-gray-500">{p.days_served}/{p.days_in_month}</td>
                  <td className="p-2 text-right font-mono">{fmt(p.base_amount)}</td>
                  {allowanceOrder.map(name => <td key={name} className="p-2 text-right font-mono">{fmt(amountByName(p, name, false))}</td>)}
                  <td className="p-2 text-right font-mono font-semibold bg-blue-50/60">{fmt(p.base_amount + p.total_allowance)}</td>
                  {deductionOrder.map(name => <td key={name} className="p-2 text-right font-mono text-red-600">{fmt(amountByName(p, name, true))}</td>)}
                  <td className="p-2 text-right font-mono font-semibold text-red-600 bg-red-50/60">{fmt(p.total_deduction)}</td>
                  <td className="p-2 text-right font-mono font-bold bg-green-50/60">{fmt(p.net_amount)}</td>
                  <td className="p-2 text-right" onClick={e => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      {permissions.canEdit && isDraft && (
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => openEditDialog(p)}>편집</Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1" onClick={() => window.open(`/print/crew-payslips/${p.id}`, '_blank')}>
                        <Printer className="w-3.5 h-3.5" />인쇄
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t font-semibold">
                <td className="p-2" colSpan={2}>합계 ({payslips.length}명)</td>
                <td className="p-2 text-right font-mono">{fmt(sumColumn(p => p.base_amount))}</td>
                {allowanceOrder.map(name => <td key={name} className="p-2 text-right font-mono">{fmt(sumColumn(p => amountByName(p, name, false)))}</td>)}
                <td className="p-2 text-right font-mono bg-blue-50/60">{fmt(totalGross)}</td>
                {deductionOrder.map(name => <td key={name} className="p-2 text-right font-mono text-red-600">{fmt(sumColumn(p => amountByName(p, name, true)))}</td>)}
                <td className="p-2 text-right font-mono text-red-600 bg-red-50/60">{fmt(totalDeduction)}</td>
                <td className="p-2 text-right font-mono bg-green-50/60">{fmt(totalNet)}</td>
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
                className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${yearMonth === p.year_month ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
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
            <DialogTitle className="text-base">{editingPayslip?.crew_name} — {yearMonth} 급여명세 편집</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-1">
            {editingPayslip?.items.map(item => (
              <div key={item.id} className="flex items-center gap-1.5">
                <span className={`text-xs w-14 shrink-0 ${item.category === 'deduction' ? 'text-red-600' : 'text-gray-600'}`}>
                  {item.category === 'deduction' ? '공제' : item.source === 'template' ? '기본급' : '수당'}
                </span>
                <span className="text-sm flex-1 truncate">{item.name}</span>
                <Input
                  type="number" className="h-8 text-sm w-28"
                  value={draftAmounts[item.id] ?? String(item.amount)}
                  onChange={e => setDraftAmounts(prev => ({ ...prev, [item.id]: e.target.value }))}
                  disabled={savingItems}
                />
              </div>
            ))}
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
              {viewingPayslip?.crew_name}{viewingPayslip?.rank_code ? ` · ${viewingPayslip.rank_code}${viewingPayslip.rank_grade ? `(${viewingPayslip.rank_grade})` : ''}` : ''} — {yearMonth} 급여명세서
            </DialogTitle>
          </DialogHeader>
          {viewingPayslip && (
            <div className="py-1">
              <CrewPayslipDetailView payslip={viewingPayslip} showTitle={false} />
              <div className="flex justify-end gap-2 pt-3">
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => window.open(`/print/crew-payslips/${viewingPayslip.id}`, '_blank')}>
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
