import { useState, useEffect, useCallback, useMemo } from 'react';
import { Wallet, RefreshCw, FileSpreadsheet, CheckCircle2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { getCurrentUser, getShips } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { supervisorService } from '@/services/supervisor.service';
import { crewPayrollService, type GeneratePayrollResult } from '@/services/crew-payroll.service';
import { crewPayrollBillingService } from '@/services/crew-payroll-billing.service';
import { exportCrewPayrollBillingToExcel } from '@/utils/crew-payroll-billing-export';
import { useTabContext } from '@/contexts/TabContext';
import type { Ship } from '@/lib/store';
import type { CrewPayrollDashboardRow, CrewPayrollBillingGroupLevel } from '@/types/crew-payroll';

const STATUS_LABELS: Record<string, string> = { none: '없음', draft: '작성중', pending_approval: '결재 진행중', confirmed: '확정됨' };
const STATUS_COLORS: Record<string, string> = {
  none: 'bg-gray-50 text-gray-400 border-gray-200',
  draft: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  pending_approval: 'bg-purple-50 text-purple-700 border-purple-200',
  confirmed: 'bg-green-50 text-green-700 border-green-200',
};
const GROUP_LEVEL_LABELS: Record<CrewPayrollBillingGroupLevel, string> = { owner: '선주', fleet: '플릿', ship: '선박' };
const fmt = (n: number) => n.toLocaleString('ko-KR');
const currentYearMonth = () => new Date().toISOString().slice(0, 7);

// 담당 선박(최대 200척) 전체를 한 화면에서 — 월을 고르면 회차 상태를 한눈에 보고, 아직 없는
// 회차는 체크박스로 골라 일괄 생성, draft 회차는 결재 없이 일괄 확정 처리할 수 있다.
// 선주/플릿/선박 단위로 묶은 청구서(엑셀)도 여기서 바로 내려받는다.
export default function CrewPayrollDashboardPage() {
  const { toast } = useToast();
  const { openNewTab } = useTabContext();

  const [ships, setShips] = useState<Ship[]>([]);
  const [owners, setOwners] = useState<{ id: string; name: string }[]>([]);
  const [fleets, setFleets] = useState<{ id: string; name: string }[]>([]);
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [rows, setRows] = useState<CrewPayrollDashboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const [ownerFilter, setOwnerFilter] = useState('');
  const [fleetFilter, setFleetFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [genResult, setGenResult] = useState<GeneratePayrollResult | null>(null);

  const [billingOpen, setBillingOpen] = useState(false);
  const [billingLevel, setBillingLevel] = useState<CrewPayrollBillingGroupLevel>('owner');
  const [billingGroupId, setBillingGroupId] = useState('all');
  const [billingExporting, setBillingExporting] = useState(false);

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
    })();
  }, []);

  const loadRows = useCallback(async (ym: string, shipList: Ship[]) => {
    if (shipList.length === 0) { setRows([]); setLoading(false); return; }
    setLoading(true);
    try {
      const data = await crewPayrollService.getDashboardRows(ym, shipList.map(s => ({ id: s.id, name: s.name, owner_id: s.owner_id, fleet_id: s.fleet_id })));
      setRows(data);
    } catch (e) {
      toast({ title: '조회 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadRows(yearMonth, ships); }, [yearMonth, ships, loadRows]);

  const handleOwnerFilterChange = (id: string) => { setOwnerFilter(id); setFleetFilter(''); };

  const fleetsForOwnerFilter = ownerFilter ? fleets.filter(f => ships.some(s => s.owner_id === ownerFilter && s.fleet_id === f.id)) : fleets;

  const filteredRows = useMemo(() => {
    return rows.filter(r =>
      (!ownerFilter || r.owner_id === ownerFilter) &&
      (!fleetFilter || r.fleet_id === fleetFilter) &&
      (!search.trim() || r.ship_name.toLowerCase().includes(search.trim().toLowerCase()))
    );
  }, [rows, ownerFilter, fleetFilter, search]);

  const generatableIds = filteredRows.filter(r => selectedIds.includes(r.ship_id) && r.status === 'none').map(r => r.ship_id);
  const confirmableIds = filteredRows.filter(r => selectedIds.includes(r.ship_id) && r.status === 'draft' && r.period_id).map(r => r.period_id!);
  const allSelectableIds = filteredRows.map(r => r.ship_id);

  const toggleSelect = (shipId: string) => setSelectedIds(prev => prev.includes(shipId) ? prev.filter(id => id !== shipId) : [...prev, shipId]);
  const toggleSelectAll = (checked: boolean) => setSelectedIds(checked ? allSelectableIds : []);

  const handleBulkGenerate = async () => {
    if (generatableIds.length === 0) return;
    setGenerating(true);
    try {
      const user = await getCurrentUser();
      if (!user) return;
      const result = await crewPayrollService.generatePayrollForShips(generatableIds, yearMonth, user.id);
      setGenResult(result);
      toast({ title: `일괄 생성 완료 — 성공 ${result.succeeded.length} / 건너뜀 ${result.skipped.length} / 실패 ${result.failed.length}` });
      setSelectedIds([]);
      await loadRows(yearMonth, ships);
    } catch (e) {
      toast({ title: '일괄 생성 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const handleBulkConfirm = async () => {
    if (confirmableIds.length === 0) return;
    if (!confirm(`선택한 ${confirmableIds.length}개 회차를 확정 처리하시겠습니까? (결재 없이 바로 확정됩니다)`)) return;
    setConfirming(true);
    try {
      const user = await getCurrentUser();
      if (!user) return;
      const results = await Promise.allSettled(confirmableIds.map(id => crewPayrollService.confirmPayrollPeriod(id, user.id)));
      const failCount = results.filter(r => r.status === 'rejected').length;
      toast({
        title: `확정 처리 완료 (${confirmableIds.length - failCount}/${confirmableIds.length})`,
        variant: failCount > 0 ? 'destructive' : undefined,
      });
      setSelectedIds([]);
      await loadRows(yearMonth, ships);
    } finally {
      setConfirming(false);
    }
  };

  const billingTargetOptions = useMemo(() => {
    if (billingLevel === 'owner') return owners.filter(o => rows.some(r => r.owner_id === o.id));
    if (billingLevel === 'fleet') return fleets.filter(f => rows.some(r => r.fleet_id === f.id));
    return rows.map(r => ({ id: r.ship_id, name: r.ship_name }));
  }, [billingLevel, owners, fleets, rows]);

  const handleExportBilling = async () => {
    setBillingExporting(true);
    try {
      let targetRows = rows;
      let label = '전체';
      if (billingGroupId !== 'all') {
        if (billingLevel === 'owner') { targetRows = rows.filter(r => r.owner_id === billingGroupId); label = targetRows[0]?.owner_name || '선주'; }
        else if (billingLevel === 'fleet') { targetRows = rows.filter(r => r.fleet_id === billingGroupId); label = targetRows[0]?.fleet_name || '플릿'; }
        else { targetRows = rows.filter(r => r.ship_id === billingGroupId); label = targetRows[0]?.ship_name || '선박'; }
      }
      const shipsForBilling = targetRows.map(r => ({ id: r.ship_id, name: r.ship_name, owner_name: r.owner_name, fleet_name: r.fleet_name }));
      const data = await crewPayrollBillingService.getBillingClaimData(yearMonth, billingLevel, label, shipsForBilling);
      if (data.ships.length === 0) { toast({ title: '내보낼 명세서가 없습니다.', variant: 'destructive' }); return; }
      await exportCrewPayrollBillingToExcel(data);
      setBillingOpen(false);
    } catch (e) {
      toast({ title: '청구서 내보내기 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setBillingExporting(false);
    }
  };

  const openShip = (row: CrewPayrollDashboardRow) => {
    openNewTab(`/crew-payroll/ship?shipId=${row.ship_id}&yearMonth=${yearMonth}`, `${row.ship_name} 급여명세`);
  };

  return (
    <div className="max-w-[1600px] mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><Wallet className="w-5 h-5 text-muted-foreground" />선원 급여명세</h1>
        <p className="text-xs text-muted-foreground mt-1">
          담당 선박 전체의 월별 급여명세 현황입니다. 회차가 없는 선박을 골라 일괄 생성하고, 확인 후 확정 처리하거나 선주/플릿/선박 단위 청구서를 내려받으세요.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">급여 월</Label>
          <Input type="month" value={yearMonth} onChange={e => { setYearMonth(e.target.value); setSelectedIds([]); }} className="h-9 text-sm w-40" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">선주</Label>
          <Select value={ownerFilter || '_all'} onValueChange={v => handleOwnerFilterChange(v === '_all' ? '' : v)}>
            <SelectTrigger className="h-9 text-sm w-40"><SelectValue placeholder="전체" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">전체</SelectItem>
              {owners.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">플릿</Label>
          <Select value={fleetFilter || '_all'} onValueChange={v => setFleetFilter(v === '_all' ? '' : v)}>
            <SelectTrigger className="h-9 text-sm w-40"><SelectValue placeholder="전체" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">전체</SelectItem>
              {fleetsForOwnerFilter.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">선박명 검색</Label>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="선박명" className="h-9 text-sm w-44 pl-7" />
          </div>
        </div>
        <div className="flex-1" />
        <Button size="sm" variant="outline" className="gap-1.5 h-9" onClick={() => setBillingOpen(true)}>
          <FileSpreadsheet className="w-3.5 h-3.5" />청구서 내보내기
        </Button>
      </div>

      {selectedIds.length > 0 && (
        <div className="flex items-center justify-between gap-2 flex-wrap bg-blue-50 border border-blue-200 rounded-md px-4 py-2">
          <span className="text-xs font-medium text-blue-800">{selectedIds.length}척 선택됨</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {generatableIds.length > 0 && (
              <Button size="sm" className="h-7 text-xs gap-1" onClick={handleBulkGenerate} disabled={generating}>
                <RefreshCw className="w-3.5 h-3.5" />{generating ? '생성 중...' : `일괄 생성 (${generatableIds.length})`}
              </Button>
            )}
            {confirmableIds.length > 0 && (
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1 bg-white text-green-700 border-green-300" onClick={handleBulkConfirm} disabled={confirming}>
                <CheckCircle2 className="w-3.5 h-3.5" />{confirming ? '처리 중...' : `일괄 확정 처리 (${confirmableIds.length})`}
              </Button>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
      ) : filteredRows.length === 0 ? (
        <div className="text-center py-12 text-sm text-gray-400">해당 조건의 선박이 없습니다.</div>
      ) : (
        <div className="rounded-md border overflow-hidden overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <Checkbox
                    checked={allSelectableIds.length > 0 && allSelectableIds.every(id => selectedIds.includes(id))}
                    onCheckedChange={checked => toggleSelectAll(!!checked)}
                  />
                </TableHead>
                <TableHead className="text-xs whitespace-nowrap">선주</TableHead>
                <TableHead className="text-xs whitespace-nowrap">플릿</TableHead>
                <TableHead className="text-xs whitespace-nowrap">선박</TableHead>
                <TableHead className="text-xs whitespace-nowrap">상태</TableHead>
                <TableHead className="text-xs text-center whitespace-nowrap">인원</TableHead>
                <TableHead className="text-xs text-right whitespace-nowrap">실지급액 합계</TableHead>
                <TableHead className="text-xs text-right whitespace-nowrap">선주청구 합계</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map(row => (
                <TableRow key={row.ship_id} className="cursor-pointer" onClick={() => openShip(row)}>
                  <TableCell onClick={e => e.stopPropagation()}>
                    <Checkbox checked={selectedIds.includes(row.ship_id)} onCheckedChange={() => toggleSelect(row.ship_id)} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{row.owner_name || '-'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{row.fleet_name || '-'}</TableCell>
                  <TableCell className="text-xs font-medium">{row.ship_name}</TableCell>
                  <TableCell><Badge variant="outline" className={`text-[11px] ${STATUS_COLORS[row.status]}`}>{STATUS_LABELS[row.status]}</Badge></TableCell>
                  <TableCell className="text-xs text-center">{row.payslip_count > 0 ? `${row.payslip_count}명` : '-'}</TableCell>
                  <TableCell className="text-xs text-right font-mono">{row.total_net_amount > 0 ? fmt(row.total_net_amount) : '-'}</TableCell>
                  <TableCell className="text-xs text-right font-mono text-orange-700">{row.total_owner_billed > 0 ? fmt(row.total_owner_billed) : '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!genResult} onOpenChange={o => !o && setGenResult(null)}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-base">일괄 생성 결과</DialogTitle></DialogHeader>
          {genResult && (
            <div className="space-y-3 text-sm">
              <p>성공 {genResult.succeeded.length}척 / 건너뜀 {genResult.skipped.length}척 / 실패 {genResult.failed.length}척</p>
              {genResult.skipped.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">건너뜀</p>
                  <ul className="text-xs text-gray-500 space-y-0.5">
                    {genResult.skipped.map(s => (
                      <li key={s.shipId}>{ships.find(sh => sh.id === s.shipId)?.name || s.shipId} — {s.reason === 'no_crew' ? '그 달 승선자 없음' : '이미 회차 있음'}</li>
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

      <Dialog open={billingOpen} onOpenChange={o => !billingExporting && setBillingOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-base">청구서 내보내기</DialogTitle></DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs">그룹 기준</Label>
              <RadioGroup value={billingLevel} onValueChange={v => { setBillingLevel(v as CrewPayrollBillingGroupLevel); setBillingGroupId('all'); }} className="flex gap-4">
                {(['owner', 'fleet', 'ship'] as CrewPayrollBillingGroupLevel[]).map(lv => (
                  <div key={lv} className="flex items-center gap-1.5">
                    <RadioGroupItem value={lv} id={`billing-${lv}`} />
                    <Label htmlFor={`billing-${lv}`} className="text-sm font-normal cursor-pointer">{GROUP_LEVEL_LABELS[lv]}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">대상</Label>
              <Select value={billingGroupId} onValueChange={setBillingGroupId}>
                <SelectTrigger className="h-9 text-sm w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  {billingTargetOptions.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setBillingOpen(false)} disabled={billingExporting}>취소</Button>
            <Button size="sm" className="gap-1.5" onClick={handleExportBilling} disabled={billingExporting}>
              <FileSpreadsheet className="w-3.5 h-3.5" />{billingExporting ? '내보내는 중...' : '엑셀 다운로드'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
