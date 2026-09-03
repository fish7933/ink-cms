import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Receipt, RefreshCw, Trash2, Search, X, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { getCurrentUser, getShips } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { supervisorService } from '@/services/supervisor.service';
import { managementFeeInvoiceService } from '@/services/management-fee-invoice.service';
import {
  managementFeeCalcService,
  type ManagementFeeDashboardRow,
  type GenerateManagementFeeResult,
  type ManagementFeeLedgerData,
} from '@/services/management-fee-calc.service';
import type { Ship } from '@/lib/store';
import type { Company, Fleet } from '@/types/models';
import ManagementFeeActualCostEntriesSection from '@/components/management-fee/ManagementFeeActualCostEntriesSection';
import OwnerFleetShipCheckTree from '@/components/management-fee/OwnerFleetShipCheckTree';

const STATUS_LABELS: Record<string, string> = { none: '미생성', draft: '임시저장' };
const STATUS_COLORS: Record<string, string> = {
  none: 'bg-gray-50 text-gray-400 border-gray-200',
  draft: 'bg-yellow-50 text-yellow-700 border-yellow-200',
};
const fmt = (n: number) => n.toLocaleString('en-US');
const currentYearMonth = () => new Date().toISOString().slice(0, 7);

// 'YYYY-MM' 한 달의 시작/끝 날짜 문자열 — Date.toISOString()은 UTC라 자정 근처에 하루
// 어긋날 수 있어, 달력 계산만으로 로컬 날짜 문자열을 직접 만든다.
function monthRangeLocal(yearMonth: string): { start: string; end: string } {
  const [y, m] = yearMonth.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return { start: `${yearMonth}-01`, end: `${yearMonth}-${String(lastDay).padStart(2, '0')}` };
}

// 관리비 계산 대시보드 — 담당 선박 전체를 한 화면에서 보고, 아직 계산되지 않은 달은
// 선택해서 일괄 계산할 수 있다. 실제 청구서 발행 이전 검증/미리보기 화면이며,
// 회차 상태는 'draft' 하나뿐이라 급여 대시보드와 달리 확정/승인 단계는 없다.
export default function ManagementFeeCalculationPage() {
  const { toast } = useToast();
  const [searchParams] = useSearchParams();

  const [ships, setShips] = useState<Ship[]>([]);
  const [owners, setOwners] = useState<Company[]>([]);
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [showQuickSelect, setShowQuickSelect] = useState(false);
  const [yearMonth, setYearMonth] = useState(() => searchParams.get('month') || currentYearMonth());
  const [rows, setRows] = useState<ManagementFeeDashboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const [ownerFilter, setOwnerFilter] = useState(() => searchParams.get('owner') || '');
  const [fleetFilter, setFleetFilter] = useState('');
  // 선주별로 한 줄만 보이고, 클릭하면 그 선주의 선박들이 펼쳐진다 — 선원이 승선 중인 관리
  // 선박이 많은 선주라면 기본으로 전부 펼쳐두면 화면이 감당 안 되므로 접어둔다. 다만 특정
  // 선주로 필터링해 들어온 경우(청구서 확인 화면에서 링크로 들어온 경우 등)는 바로 볼 대상이
  // 명확하니 그 선주만 펼쳐서 보여준다.
  const [expandedOwners, setExpandedOwners] = useState<Set<string>>(() => {
    const initialOwner = searchParams.get('owner');
    return initialOwner ? new Set([initialOwner]) : new Set();
  });
  const toggleOwnerExpanded = (ownerId: string) => {
    setExpandedOwners(prev => {
      const next = new Set(prev);
      if (next.has(ownerId)) next.delete(ownerId); else next.add(ownerId);
      return next;
    });
  };
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [genResult, setGenResult] = useState<GenerateManagementFeeResult | null>(null);

  const [ledgerPeriodId, setLedgerPeriodId] = useState<string | null>(null);
  const [ledgerData, setLedgerData] = useState<ManagementFeeLedgerData | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [bulkRegenerating, setBulkRegenerating] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
        ownerIds.length > 0 ? supabase.from('companies').select('*').in('id', ownerIds).order('name') : Promise.resolve({ data: [] as Company[] }),
        fleetIds.length > 0 ? supabase.from('fleets').select('*').in('id', fleetIds).order('name') : Promise.resolve({ data: [] as Fleet[] }),
      ]);
      setOwners((ownerRows || []) as Company[]);
      setFleets((fleetRows || []) as Fleet[]);
    })();
  }, []);

  // silent=true는 재계산/삭제 등 액션 뒤에 수치만 조용히 갱신할 때 쓴다 — 전체 로딩
  // 스피너로 테이블을 통째로 갈아치우면 화면이 깜빡이므로, 그 경우는 loading을 건드리지 않는다.
  const loadRows = useCallback(async (ym: string, shipList: Ship[], silent = false) => {
    if (shipList.length === 0) { setRows([]); if (!silent) setLoading(false); return; }
    if (!silent) setLoading(true);
    try {
      const data = await managementFeeCalcService.getDashboardRows(ym, shipList.map(s => ({ id: s.id, name: s.name, owner_id: s.owner_id, fleet_id: s.fleet_id })));
      setRows(data);
    } catch (e) {
      toast({ title: '불러오기 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      if (!silent) setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadRows(yearMonth, ships); setLedgerPeriodId(null); setLedgerData(null); }, [yearMonth, ships, loadRows]);

  const handleOwnerFilterChange = (id: string) => { setOwnerFilter(id); setFleetFilter(''); };
  const fleetsForOwnerFilter = ownerFilter ? fleets.filter(f => ships.some(s => s.owner_id === ownerFilter && s.fleet_id === f.id)) : fleets;

  const filteredRows = useMemo(() => {
    return rows.filter(r =>
      (!ownerFilter || r.owner_id === ownerFilter) &&
      (!fleetFilter || r.fleet_id === fleetFilter) &&
      (!search.trim() || r.ship_name.toLowerCase().includes(search.trim().toLowerCase()))
    );
  }, [rows, ownerFilter, fleetFilter, search]);

  const ownerGroups = useMemo(() => {
    const byOwner = new Map<string, { ownerId: string; ownerName: string; rows: ManagementFeeDashboardRow[] }>();
    for (const row of filteredRows) {
      const key = row.owner_id || '_none';
      const group = byOwner.get(key) || { ownerId: key, ownerName: row.owner_name || '선주 미지정', rows: [] };
      group.rows.push(row);
      byOwner.set(key, group);
    }
    return [...byOwner.values()].sort((a, b) => a.ownerName.localeCompare(b.ownerName));
  }, [filteredRows]);

  const generatableIds = rows.filter(r => selectedIds.includes(r.ship_id) && r.status === 'none').map(r => r.ship_id);
  // 이미 계산된(status='draft') 선박은 재계산/삭제 대상 — 청구서가 이미 발행됐는지 여부와
  // 무관하게 동작한다(발행된 청구서도 그 뒤 관리비 계산이 바뀌면 다시 계산할 수 있어야 함).
  const regeneratablePeriods = rows.filter(r => selectedIds.includes(r.ship_id) && r.status === 'draft' && r.period_id).map(r => ({ shipId: r.ship_id, periodId: r.period_id as string }));
  const allSelectableIds = filteredRows.map(r => r.ship_id);

  const toggleSelect = (shipId: string) => setSelectedIds(prev => prev.includes(shipId) ? prev.filter(id => id !== shipId) : [...prev, shipId]);
  const toggleSelectAll = (checked: boolean) => setSelectedIds(checked ? allSelectableIds : []);

  const handleBulkGenerate = async () => {
    if (generatableIds.length === 0) return;
    setGenerating(true);
    try {
      const user = await getCurrentUser();
      if (!user) return;
      const result = await managementFeeCalcService.generateForShips(generatableIds, yearMonth, user.id);
      setGenResult(result);
      toast({ title: `일괄 계산 완료 — 성공 ${result.succeeded.length} / 건너뜀 ${result.skipped.length} / 실패 ${result.failed.length}` });
      setSelectedIds([]);
      await loadRows(yearMonth, ships, true);
    } catch (e) {
      toast({ title: '일괄 계산 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const handleBulkRegenerate = async () => {
    if (regeneratablePeriods.length === 0) return;
    if (!confirm(`선택한 ${regeneratablePeriods.length}척의 관리비를 다시 계산하시겠습니까? 이미 발행된 청구서가 있는 선박도 포함됩니다.`)) return;
    setBulkRegenerating(true);
    let succeeded = 0;
    const failed: string[] = [];
    try {
      const CHUNK = 12;
      for (let i = 0; i < regeneratablePeriods.length; i += CHUNK) {
        const chunk = regeneratablePeriods.slice(i, i + CHUNK);
        const results = await Promise.allSettled(chunk.map(p => managementFeeCalcService.regeneratePeriod(p.periodId)));
        results.forEach((r, idx) => {
          if (r.status === 'fulfilled') succeeded++;
          else failed.push(rows.find(row => row.period_id === chunk[idx].periodId)?.ship_name || chunk[idx].shipId);
        });
      }
      toast({
        title: `일괄 재계산 완료 — 성공 ${succeeded} / 실패 ${failed.length}`,
        description: failed.length > 0 ? `실패: ${failed.join(', ')}` : undefined,
        variant: failed.length > 0 ? 'destructive' : undefined,
      });
      setSelectedIds([]);
      await loadRows(yearMonth, ships, true);
    } finally {
      setBulkRegenerating(false);
    }
  };

  const handleBulkDelete = async () => {
    if (regeneratablePeriods.length === 0) return;
    if (!confirm(`선택한 ${regeneratablePeriods.length}척의 관리비 계산 회차를 삭제하시겠습니까? 이미 발행된 청구서가 있는 선박도 포함되며, 되돌릴 수 없습니다.`)) return;
    setBulkDeleting(true);
    let succeeded = 0;
    const failed: string[] = [];
    const affectedOwnerIds = new Set(
      regeneratablePeriods.map(p => rows.find(r => r.period_id === p.periodId)?.owner_id).filter((id): id is string => !!id)
    );
    try {
      const CHUNK = 12;
      for (let i = 0; i < regeneratablePeriods.length; i += CHUNK) {
        const chunk = regeneratablePeriods.slice(i, i + CHUNK);
        const results = await Promise.allSettled(chunk.map(p => managementFeeCalcService.deletePeriod(p.periodId)));
        results.forEach((r, idx) => {
          if (r.status === 'fulfilled') succeeded++;
          else failed.push(rows.find(row => row.period_id === chunk[idx].periodId)?.ship_name || chunk[idx].shipId);
        });
      }
      // 삭제 후 남은 계산 회차가 없는 선주+월인데 청구서가 "발행됨"으로 남아있으면 임시저장으로 되돌린다.
      await Promise.all([...affectedOwnerIds].map(ownerId => managementFeeInvoiceService.syncStatusAfterCalcDeleted(ownerId, yearMonth)));
      toast({
        title: `일괄 삭제 완료 — 성공 ${succeeded} / 실패 ${failed.length}`,
        description: failed.length > 0 ? `실패: ${failed.join(', ')}` : undefined,
        variant: failed.length > 0 ? 'destructive' : undefined,
      });
      setSelectedIds([]);
      if (ledgerPeriodId && regeneratablePeriods.some(p => p.periodId === ledgerPeriodId)) { setLedgerPeriodId(null); setLedgerData(null); }
      await loadRows(yearMonth, ships, true);
    } finally {
      setBulkDeleting(false);
    }
  };

  const loadLedger = async (periodId: string) => {
    setLedgerPeriodId(periodId);
    setLedgerLoading(true);
    try {
      const data = await managementFeeCalcService.getLedgerForPeriod(periodId);
      setLedgerData(data);
    } finally {
      setLedgerLoading(false);
    }
  };

  const openShip = (row: ManagementFeeDashboardRow) => {
    if (row.period_id) loadLedger(row.period_id);
  };

  // 이번 달에 승선/하선한 선원 — 항공권 등 승·하선 비용을 실비 항목에 입력할 때 빠뜨리기
  // 쉬우므로, 선원별 상세 표의 해당 줄에 배지 + 배경색으로 눈에 띄게 짚어준다.
  const { embarkedKeySet, disembarkedKeySet } = useMemo(() => {
    if (!ledgerData) return { embarkedKeySet: new Set<string>(), disembarkedKeySet: new Set<string>() };
    const { start, end } = monthRangeLocal(yearMonth);
    return {
      embarkedKeySet: new Set(ledgerData.rows.filter(r => r.embark_date >= start && r.embark_date <= end).map(r => r.crew_member_id + r.embark_date)),
      disembarkedKeySet: new Set(ledgerData.rows.filter(r => r.disembark_date && r.disembark_date >= start && r.disembark_date <= end).map(r => r.crew_member_id + r.embark_date)),
    };
  }, [ledgerData, yearMonth]);

  const handleRegenerate = async () => {
    if (!ledgerPeriodId) return;
    setRegenerating(true);
    try {
      await managementFeeCalcService.regeneratePeriod(ledgerPeriodId);
      toast({ title: '재계산 완료' });
      await loadRows(yearMonth, ships, true);
      const updatedRow = rows.find(r => r.period_id === ledgerPeriodId);
      if (updatedRow) {
        const fresh = await managementFeeCalcService.getDashboardRows(yearMonth, [{ id: updatedRow.ship_id, name: updatedRow.ship_name, owner_id: updatedRow.owner_id, fleet_id: updatedRow.fleet_id }]);
        if (fresh[0]?.period_id) loadLedger(fresh[0].period_id);
      }
    } catch (e) {
      toast({ title: '재계산 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setRegenerating(false);
    }
  };

  const handleDelete = async () => {
    if (!ledgerPeriodId) return;
    if (!confirm('이 관리비 계산 회차를 삭제하시겠습니까?')) return;
    setDeleting(true);
    try {
      const ownerId = rows.find(r => r.period_id === ledgerPeriodId)?.owner_id;
      await managementFeeCalcService.deletePeriod(ledgerPeriodId);
      // 삭제 후 그 선주+월에 남은 계산 회차가 없는데 청구서가 "발행됨"으로 남아있으면
      // 임시저장으로 되돌린다 — 근거 없는 발행 상태가 남지 않도록.
      if (ownerId) await managementFeeInvoiceService.syncStatusAfterCalcDeleted(ownerId, yearMonth);
      toast({ title: '삭제 완료' });
      setLedgerPeriodId(null);
      setLedgerData(null);
      await loadRows(yearMonth, ships, true);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-[1600px] mx-auto px-3 sm:px-4 lg:px-6 py-3 space-y-2.5">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><Receipt className="w-5 h-5 text-muted-foreground" />관리비 계산</h1>
        <p className="text-xs text-muted-foreground mt-1">
          담당 선박 전체의 월별 관리비 계산 현황입니다. 아직 계산되지 않은 선박을 선택해 일괄 계산한 뒤, 선박을 클릭해 선원×항목별 상세 내역을 확인하세요. 실제 청구서 발행 전 검증용 화면입니다.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">대상 월</Label>
          <Input type="month" value={yearMonth} onChange={e => { setYearMonth(e.target.value); setSelectedIds([]); }} className="h-7 text-xs w-40" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">선주</Label>
          <Select value={ownerFilter || '_all'} onValueChange={v => handleOwnerFilterChange(v === '_all' ? '' : v)}>
            <SelectTrigger className="h-7 text-xs w-40"><SelectValue placeholder="전체" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">전체</SelectItem>
              {owners.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">플릿</Label>
          <Select value={fleetFilter || '_all'} onValueChange={v => setFleetFilter(v === '_all' ? '' : v)}>
            <SelectTrigger className="h-7 text-xs w-40"><SelectValue placeholder="전체" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">전체</SelectItem>
              {fleetsForOwnerFilter.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">선박 검색</Label>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="선박명" className="h-7 text-xs w-44 pl-7" />
          </div>
        </div>
      </div>

      <div className="border rounded-md">
        <button
          type="button"
          onClick={() => setShowQuickSelect(v => !v)}
          className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          {showQuickSelect ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          전체 / 선주 / 플릿 / 선박 단위로 빠르게 선택
        </button>
        {showQuickSelect && (
          <div className="px-3 pb-2 pt-1 border-t">
            <OwnerFleetShipCheckTree
              ships={ships}
              companies={owners}
              fleets={fleets}
              selectedShipIds={new Set(selectedIds)}
              onChange={ids => setSelectedIds([...ids])}
            />
          </div>
        )}
      </div>

      {selectedIds.length > 0 && (
        <div className="flex items-center justify-between gap-2 flex-wrap bg-blue-50 border border-blue-200 rounded-md px-3 py-1.5">
          <span className="text-xs font-medium text-blue-800">{selectedIds.length}척 선택됨</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {generatableIds.length > 0 && (
              <Button size="sm" className="h-7 text-xs gap-1" onClick={handleBulkGenerate} disabled={generating}>
                <RefreshCw className="w-3.5 h-3.5" />{generating ? '계산 중...' : `일괄 계산 (${generatableIds.length})`}
              </Button>
            )}
            {regeneratablePeriods.length > 0 && (
              <>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={handleBulkRegenerate} disabled={bulkRegenerating || bulkDeleting}>
                  <RefreshCw className="w-3.5 h-3.5" />{bulkRegenerating ? '재계산 중...' : `일괄 재계산 (${regeneratablePeriods.length})`}
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-red-600 border-red-300 hover:bg-red-50" onClick={handleBulkDelete} disabled={bulkRegenerating || bulkDeleting}>
                  <Trash2 className="w-3.5 h-3.5" />{bulkDeleting ? '삭제 중...' : `일괄 삭제 (${regeneratablePeriods.length})`}
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
      ) : filteredRows.length === 0 ? (
        <div className="text-center py-12 text-sm text-gray-400">조건에 맞는 선박이 없습니다.</div>
      ) : (
        <div className="rounded-md border overflow-hidden overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="py-1 px-2 w-8">
                  <Checkbox
                    checked={allSelectableIds.length > 0 && allSelectableIds.every(id => selectedIds.includes(id))}
                    onCheckedChange={checked => toggleSelectAll(!!checked)}
                  />
                </TableHead>
                <TableHead className="py-1 px-2 text-xs whitespace-nowrap">플릿</TableHead>
                <TableHead className="py-1 px-2 text-xs whitespace-nowrap">선박</TableHead>
                <TableHead className="py-1 px-2 text-xs whitespace-nowrap">상태</TableHead>
                <TableHead className="py-1 px-2 text-xs text-center whitespace-nowrap">계산 라인 수</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ownerGroups.map(group => {
                const groupIds = group.rows.map(r => r.ship_id);
                const expanded = expandedOwners.has(group.ownerId);
                return (
                  <Fragment key={group.ownerId}>
                    <TableRow className="bg-slate-50 hover:bg-slate-100 cursor-pointer" onClick={() => toggleOwnerExpanded(group.ownerId)}>
                      <TableCell className="py-1 px-2" onClick={e => e.stopPropagation()}>
                        <Checkbox
                          checked={groupIds.length > 0 && groupIds.every(id => selectedIds.includes(id))}
                          onCheckedChange={checked => setSelectedIds(prev => checked ? [...new Set([...prev, ...groupIds])] : prev.filter(id => !groupIds.includes(id)))}
                        />
                      </TableCell>
                      <TableCell colSpan={4} className="py-1 px-2 text-xs font-semibold text-slate-700">
                        <span className="inline-flex items-center gap-1">
                          {expanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                          {group.ownerName}
                          <span className="font-normal text-slate-500">({group.rows.length}척)</span>
                        </span>
                      </TableCell>
                    </TableRow>
                    {expanded && group.rows.map(row => (
                      <Fragment key={row.ship_id}>
                        <TableRow className={`cursor-pointer ${ledgerPeriodId && ledgerPeriodId === row.period_id ? 'bg-blue-50/60' : ''}`} onClick={() => openShip(row)}>
                          <TableCell className="py-1 px-2" onClick={e => e.stopPropagation()}>
                            <Checkbox checked={selectedIds.includes(row.ship_id)} onCheckedChange={() => toggleSelect(row.ship_id)} />
                          </TableCell>
                          <TableCell className="py-1 px-2 text-xs text-muted-foreground">{row.fleet_name || '-'}</TableCell>
                          <TableCell className="py-1 px-2 text-xs font-medium">{row.ship_name}</TableCell>
                          <TableCell className="py-1 px-2"><Badge variant="outline" className={`text-[11px] ${STATUS_COLORS[row.status]}`}>{STATUS_LABELS[row.status]}</Badge></TableCell>
                          <TableCell className="py-1 px-2 text-xs text-center">{row.line_count > 0 ? row.line_count : '-'}</TableCell>
                        </TableRow>
                        {/* 선택된 선박의 선원×항목 상세 내역 — 클릭한 선박 바로 아래에 펼쳐진다.
                            ledgerPeriodId가 null일 때(아무것도 선택 안 함) row.period_id도 null인
                            계산 미생성 선박과 비교하면 둘 다 null이라 항상 true가 되어 버리므로,
                            ledgerPeriodId가 실제로 선택된 경우에만 비교한다. */}
                        {!!ledgerPeriodId && ledgerPeriodId === row.period_id && (
                          <TableRow className="hover:bg-transparent">
                            <TableCell colSpan={5} className="p-0 bg-slate-50/70 border-t-0">
                              <div className="p-2.5 space-y-2.5">
                                <div className="flex items-center justify-between">
                                  <h3 className="text-sm font-semibold">
                                    {ledgerData ? `${[ledgerData.owner_name, ledgerData.fleet_name, ledgerData.ship_name].filter(Boolean).join(' > ')} — ${yearMonth}` : '불러오는 중...'}
                                  </h3>
                                  <div className="flex gap-2">
                                    <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs bg-white" onClick={handleRegenerate} disabled={regenerating}>
                                      <RefreshCw className="w-3.5 h-3.5" />{regenerating ? '재계산 중...' : '재계산'}
                                    </Button>
                                    <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs text-red-600 border-red-300 hover:bg-red-50 bg-white" onClick={handleDelete} disabled={deleting}>
                                      <Trash2 className="w-3.5 h-3.5" />삭제
                                    </Button>
                                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setLedgerPeriodId(null); setLedgerData(null); }}>
                                      <X className="w-3.5 h-3.5" />
                                    </Button>
                                  </div>
                                </div>
                                {ledgerLoading || !ledgerData ? (
                                  <div className="text-center py-8 text-sm text-gray-400">불러오는 중...</div>
                                ) : (
                                  <>
                                    {/* 선원별 상세 (피벗) — 이번 달 승선/하선 선원은 배지 + 배경색으로 표시해
                                        승·하선 비용(항공권 등)을 실비 항목에 빠짐없이 입력했는지 바로 확인할 수 있게 한다. */}
                                    <div>
                                    <h3 className="text-sm font-semibold mb-2">선원별 청구 항목</h3>
                                    <div className="rounded-md border bg-white overflow-x-auto">
                                      <Table>
                                        <TableHeader>
                                          <TableRow>
                                            <TableHead className="py-1 px-2 text-xs whitespace-nowrap">직급</TableHead>
                                            <TableHead className="py-1 px-2 text-xs whitespace-nowrap">이름</TableHead>
                                            <TableHead className="py-1 px-2 text-xs whitespace-nowrap">국적</TableHead>
                                            <TableHead className="py-1 px-2 text-xs whitespace-nowrap">승선일</TableHead>
                                            <TableHead className="py-1 px-2 text-xs whitespace-nowrap">하선일</TableHead>
                                            {ledgerData.fee_item_columns.map(col => (
                                              <TableHead key={col} className="py-1 px-2 text-xs text-right whitespace-nowrap">{col}</TableHead>
                                            ))}
                                            <TableHead className="py-1 px-2 text-xs text-right whitespace-nowrap">합계</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {ledgerData.rows.length === 0 ? (
                                            <TableRow><TableCell colSpan={6 + ledgerData.fee_item_columns.length} className="text-center py-6 text-xs text-gray-400">계산된 라인이 없습니다.</TableCell></TableRow>
                                          ) : ledgerData.rows.map(r => {
                                            const rowKey = r.crew_member_id + r.embark_date;
                                            const isEmbarked = embarkedKeySet.has(rowKey);
                                            const isDisembarked = disembarkedKeySet.has(rowKey);
                                            return (
                                              <TableRow key={rowKey} className={isDisembarked ? 'bg-amber-50/60 hover:bg-amber-50' : isEmbarked ? 'bg-blue-50/60 hover:bg-blue-50' : ''}>
                                                <TableCell className="py-1 px-2 text-xs whitespace-nowrap">{r.rank_code}{r.rank_grade ? `(${r.rank_grade})` : ''}</TableCell>
                                                <TableCell className="py-1 px-2 text-xs font-medium whitespace-nowrap">
                                                  <span className="inline-flex items-center gap-1">
                                                    {r.crew_name}
                                                    {isEmbarked && <Badge className="text-[10px] bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-100">승선</Badge>}
                                                    {isDisembarked && <Badge className="text-[10px] bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-100">하선</Badge>}
                                                  </span>
                                                </TableCell>
                                                <TableCell className="py-1 px-2 text-xs">{r.nationality || '-'}</TableCell>
                                                <TableCell className="py-1 px-2 text-xs whitespace-nowrap">{r.embark_date}</TableCell>
                                                <TableCell className="py-1 px-2 text-xs whitespace-nowrap">{r.disembark_date || '-'}</TableCell>
                                                {ledgerData.fee_item_columns.map(col => (
                                                  <TableCell key={col} className="py-1 px-2 text-xs text-right font-mono">
                                                    {r.item_amounts[col] == null ? (col in r.item_amounts ? '수기입력' : '-') : fmt(r.item_amounts[col]!)}
                                                  </TableCell>
                                                ))}
                                                <TableCell className="py-1 px-2 text-xs text-right font-mono font-semibold">{fmt(r.total_amount)}</TableCell>
                                              </TableRow>
                                            );
                                          })}
                                        </TableBody>
                                        {ledgerData.rows.length > 0 && (
                                          <TableFooter>
                                            <TableRow>
                                              <TableCell colSpan={5} className="py-1 px-2 text-xs text-right font-semibold">
                                                합계 <span className="font-normal text-gray-400">(아래 항목별 합계와 비교)</span>
                                              </TableCell>
                                              {ledgerData.fee_item_columns.map(col => (
                                                <TableCell key={`sum-${col}`} className="py-1 px-2 text-xs text-right font-mono font-semibold">
                                                  {fmt(ledgerData.rows.reduce((sum, r) => sum + (typeof r.item_amounts[col] === 'number' ? r.item_amounts[col]! : 0), 0))}
                                                </TableCell>
                                              ))}
                                              <TableCell className="py-1 px-2 text-xs text-right font-mono font-semibold">
                                                {fmt(ledgerData.rows.reduce((sum, r) => sum + r.total_amount, 0))}
                                              </TableCell>
                                            </TableRow>
                                          </TableFooter>
                                        )}
                                      </Table>
                                    </div>
                                    </div>

                                    {/* 항목별 합계 (상한 적용 여부 / 부가세 대상 여부) */}
                                    {ledgerData.item_totals.length > 0 && (
                                      <div>
                                      <h3 className="text-sm font-semibold mb-2">항목별 청구금액</h3>
                                      <div className="rounded-md border bg-white overflow-x-auto">
                                        <Table>
                                          <TableHeader>
                                            <TableRow>
                                              <TableHead className="py-1 px-2 text-xs">청구 항목</TableHead>
                                              <TableHead className="py-1 px-2 text-xs text-right">전 선원 합계</TableHead>
                                              <TableHead className="py-1 px-2 text-xs text-right">상한</TableHead>
                                              <TableHead className="py-1 px-2 text-xs text-right">청구 금액</TableHead>
                                              <TableHead className="py-1 px-2 text-xs text-right text-teal-700">부가세</TableHead>
                                              <TableHead className="py-1 px-2 text-xs">비고</TableHead>
                                            </TableRow>
                                          </TableHeader>
                                          <TableBody>
                                            {ledgerData.item_totals.map(t => (
                                              <TableRow key={`${t.fee_item_id}-${t.currency}`}>
                                                <TableCell className="py-1 px-2 text-xs font-medium">{t.fee_item_name}</TableCell>
                                                <TableCell className="py-1 px-2 text-xs text-right font-mono">{fmt(t.raw_total)} {t.currency}</TableCell>
                                                <TableCell className="py-1 px-2 text-xs text-right font-mono">{t.cap_amount != null ? `${fmt(t.cap_amount)} ${t.currency}` : '-'}</TableCell>
                                                <TableCell className="py-1 px-2 text-xs text-right font-mono font-semibold">{fmt(t.billed_total)} {t.currency}</TableCell>
                                                <TableCell className="py-1 px-2 text-xs text-right font-mono text-teal-700">
                                                  {!t.is_vat_applicable ? '-' : t.vat_amount_krw != null ? `${fmt(t.vat_amount_krw)} KRW` : '환율 없음'}
                                                </TableCell>
                                                <TableCell className="py-1 px-2 text-xs">
                                                  {t.was_capped && <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300 bg-amber-50">상한 적용됨</Badge>}
                                                </TableCell>
                                              </TableRow>
                                            ))}
                                          </TableBody>
                                          {ledgerData.item_totals.some(t => t.is_vat_applicable) && (
                                            <TableFooter>
                                              <TableRow>
                                                <TableCell colSpan={4} className="py-1 px-2 text-xs text-right font-semibold text-teal-700">부가세 합계</TableCell>
                                                <TableCell className="py-1 px-2 text-xs text-right font-mono font-semibold text-teal-700">
                                                  {ledgerData.krw_rate_to_usd ? `${fmt(ledgerData.vat_amount_krw)} KRW` : '환율 없음'}
                                                </TableCell>
                                                <TableCell className="py-1 px-2" />
                                              </TableRow>
                                            </TableFooter>
                                          )}
                                        </Table>
                                        {ledgerData.item_totals.some(t => t.is_vat_applicable) && !ledgerData.krw_rate_to_usd && (
                                          <div className="px-3 py-1.5 border-t text-xs text-amber-600">
                                            환율 관리에 이 달 KRW 환율이 없어 부가세를 계산할 수 없습니다.
                                          </div>
                                        )}
                                      </div>
                                      </div>
                                    )}

                                    {/* 실비(수기입력) 항목 기록 — 승·하선 비용상세와 1:1 대응 */}
                                    <div>
                                      <h3 className="text-sm font-semibold mb-2">실비 청구 항목</h3>
                                      <ManagementFeeActualCostEntriesSection
                                        periodId={ledgerPeriodId}
                                        shipId={ledgerData.period.ship_id}
                                        yearMonth={ledgerData.period.year_month}
                                        entries={ledgerData.actual_cost_entries}
                                        onChanged={() => loadLedger(ledgerPeriodId)}
                                      />
                                    </div>
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    ))}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!genResult} onOpenChange={o => !o && setGenResult(null)}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-base">일괄 계산 결과</DialogTitle></DialogHeader>
          {genResult && (
            <div className="space-y-3 text-sm">
              <p>성공 {genResult.succeeded.length} / 건너뜀 {genResult.skipped.length} / 실패 {genResult.failed.length}</p>
              {genResult.skipped.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">건너뜀</p>
                  <ul className="text-xs text-gray-500 space-y-0.5">
                    {genResult.skipped.map(s => (
                      <li key={s.shipId}>
                        {ships.find(sh => sh.id === s.shipId)?.name || s.shipId} — {
                          s.reason === 'no_crew' ? '이번 달 승선 선원 없음'
                          : s.reason === 'no_template' ? '배정된 관리비 템플릿 없음'
                          : '이미 회차가 존재함'
                        }
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {genResult.failed.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-red-500 mb-1">실패</p>
                  <ul className="text-xs text-red-500 space-y-0.5">
                    {genResult.failed.map(f => (
                      <li key={f.shipId}>{ships.find(sh => sh.id === f.shipId)?.name || f.shipId} — {f.error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <DialogFooter><Button size="sm" onClick={() => setGenResult(null)}>확인</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
