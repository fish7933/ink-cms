import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import { Wallet, RefreshCw, FileSpreadsheet, CheckCircle2, Search, Archive, Ban } from 'lucide-react';
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
import { crewPayrollArchiveService } from '@/services/crew-payroll-archive.service';
import { exportCrewPayrollBillingToExcel } from '@/utils/crew-payroll-billing-export';
import { useTabContext } from '@/contexts/TabContext';
import type { Ship } from '@/lib/store';
import type { CrewPayrollDashboardRow, CrewPayrollBillingGroupLevel } from '@/types/crew-payroll';

const STATUS_LABELS: Record<string, string> = { none: 'None', draft: 'Draft', pending_approval: 'Pending Approval', confirmed: 'Confirmed' };
const STATUS_COLORS: Record<string, string> = {
  none: 'bg-gray-50 text-gray-400 border-gray-200',
  draft: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  pending_approval: 'bg-purple-50 text-purple-700 border-purple-200',
  confirmed: 'bg-green-50 text-green-700 border-green-200',
};
const GROUP_LEVEL_LABELS: Record<CrewPayrollBillingGroupLevel, string> = { owner: 'Owner', fleet: 'Fleet', ship: 'Vessel' };
const fmt = (n: number) => n.toLocaleString('en-US');
const currentYearMonth = () => new Date().toISOString().slice(0, 7);

// 담당 선박(최대 200척) 전체를 한 화면에서 — 월을 고르면 회차 상태를 한눈에 보고, 아직 없는
// 회차는 체크박스로 골라 일괄 생성, draft 회차는 결재 없이 일괄 확정 처리할 수 있다.
// 선주/플릿/선박 단위로 묶은 청구서(엑셀)도 여기서 바로 내려받는다.
// 선주/매닝사와 공유되는 화면이라 표시 문구는 전부 영어로 유지한다.
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
  const [invalidating, setInvalidating] = useState(false);

  const [ownerFilter, setOwnerFilter] = useState('');
  const [fleetFilter, setFleetFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [genResult, setGenResult] = useState<GeneratePayrollResult | null>(null);

  const [billingOpen, setBillingOpen] = useState(false);
  const [billingLevel, setBillingLevel] = useState<CrewPayrollBillingGroupLevel>('owner');
  const [billingGroupId, setBillingGroupId] = useState('all');
  const [billingExporting, setBillingExporting] = useState(false);
  const [archivingOwnerId, setArchivingOwnerId] = useState<string | null>(null);

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
      toast({ title: 'Failed to load', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
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

  // 선주 단위로 그룹핑 — 각 그룹 안에서 선박별 급여 확정 단계(상태 배지)를 한눈에 볼 수 있다.
  const ownerGroups = useMemo(() => {
    const byOwner = new Map<string, { ownerId: string; ownerName: string; rows: CrewPayrollDashboardRow[] }>();
    for (const row of filteredRows) {
      const key = row.owner_id || '_none';
      const group = byOwner.get(key) || { ownerId: key, ownerName: row.owner_name || 'No Owner', rows: [] };
      group.rows.push(row);
      byOwner.set(key, group);
    }
    return [...byOwner.values()].sort((a, b) => a.ownerName.localeCompare(b.ownerName));
  }, [filteredRows]);

  const generatableIds = filteredRows.filter(r => selectedIds.includes(r.ship_id) && r.status === 'none').map(r => r.ship_id);
  const confirmableIds = filteredRows.filter(r => selectedIds.includes(r.ship_id) && r.status === 'draft' && r.period_id).map(r => r.period_id!);
  const invalidatableRows = filteredRows.filter(r => selectedIds.includes(r.ship_id) && r.period_id);
  const invalidatableIds = invalidatableRows.map(r => r.period_id!);
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
      toast({ title: `Bulk generation complete — Succeeded ${result.succeeded.length} / Skipped ${result.skipped.length} / Failed ${result.failed.length}` });
      setSelectedIds([]);
      await loadRows(yearMonth, ships);
    } catch (e) {
      toast({ title: 'Bulk generation failed', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const handleBulkConfirm = async () => {
    if (confirmableIds.length === 0) return;
    if (!confirm(`Confirm the ${confirmableIds.length} selected payroll periods? (This finalizes them directly, without an approval workflow.)`)) return;
    setConfirming(true);
    try {
      const user = await getCurrentUser();
      if (!user) return;
      const results = await Promise.allSettled(confirmableIds.map(id => crewPayrollService.confirmPayrollPeriod(id, user.id)));
      const failCount = results.filter(r => r.status === 'rejected').length;
      toast({
        title: `Confirmation complete (${confirmableIds.length - failCount}/${confirmableIds.length})`,
        variant: failCount > 0 ? 'destructive' : undefined,
      });
      setSelectedIds([]);
      await loadRows(yearMonth, ships);
    } finally {
      setConfirming(false);
    }
  };

  const handleBulkInvalidate = async () => {
    if (invalidatableIds.length === 0) return;
    const confirmedCount = invalidatableRows.filter(r => r.status === 'confirmed').length;
    const message = confirmedCount > 0
      ? `선택한 ${invalidatableIds.length}개 회차 중 ${confirmedCount}개는 이미 확정 처리된 회차입니다. 그래도 무효화(삭제)하시겠습니까? 생성된 급여명세서가 모두 삭제되며 되돌릴 수 없습니다.`
      : `선택한 ${invalidatableIds.length}개 급여 회차를 무효화(삭제)하시겠습니까? 생성된 급여명세서가 모두 삭제되며 되돌릴 수 없습니다.`;
    if (!confirm(message)) return;
    setInvalidating(true);
    try {
      await crewPayrollService.invalidatePayrollPeriods(invalidatableIds);
      toast({ title: `${invalidatableIds.length}개 회차를 무효화했습니다.` });
      setSelectedIds([]);
      await loadRows(yearMonth, ships);
    } catch (e) {
      toast({ title: '무효화 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setInvalidating(false);
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
      let label = 'All';
      if (billingGroupId !== 'all') {
        if (billingLevel === 'owner') { targetRows = rows.filter(r => r.owner_id === billingGroupId); label = targetRows[0]?.owner_name || 'Owner'; }
        else if (billingLevel === 'fleet') { targetRows = rows.filter(r => r.fleet_id === billingGroupId); label = targetRows[0]?.fleet_name || 'Fleet'; }
        else { targetRows = rows.filter(r => r.ship_id === billingGroupId); label = targetRows[0]?.ship_name || 'Vessel'; }
      }
      const shipsForBilling = targetRows.map(r => ({ id: r.ship_id, name: r.ship_name, owner_name: r.owner_name, fleet_name: r.fleet_name, owner_id: r.owner_id, fleet_id: r.fleet_id }));
      const data = await crewPayrollBillingService.getBillingClaimData(yearMonth, billingLevel, label, shipsForBilling);
      if (data.ships.length === 0) { toast({ title: 'No payslips to export.', variant: 'destructive' }); return; }
      await exportCrewPayrollBillingToExcel(data);
      setBillingOpen(false);
    } catch (e) {
      toast({ title: 'Claim export failed', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setBillingExporting(false);
    }
  };

  const openShip = (row: CrewPayrollDashboardRow) => {
    openNewTab(`/crew-payroll/ship?shipId=${row.ship_id}&yearMonth=${yearMonth}`, `${row.ship_name} Payroll`);
  };

  // 선주 소속 선박들의 급여대장+급여명세서 엑셀을 선박별로 각각 생성해 zip 하나로 묶어
  // 내려받는다 — 저장 위치는 브라우저의 파일 저장 다이얼로그(showSaveFilePicker)로 묻는다.
  const handleDownloadOwnerZip = async (group: { ownerId: string; ownerName: string; rows: CrewPayrollDashboardRow[] }) => {
    const shipsWithPeriod = group.rows.filter(r => r.period_id);
    if (shipsWithPeriod.length === 0) { toast({ title: 'No generated payroll periods to download for this owner.', variant: 'destructive' }); return; }
    setArchivingOwnerId(group.ownerId);
    try {
      const { includedCount, skippedCount } = await crewPayrollArchiveService.downloadPayrollZip(
        yearMonth,
        group.ownerName,
        shipsWithPeriod.map(r => ({ ship_id: r.ship_id, ship_name: r.ship_name, period_id: r.period_id }))
      );
      if (includedCount > 0) {
        toast({ title: `ZIP downloaded — ${includedCount} vessel(s) included${skippedCount > 0 ? `, ${skippedCount} skipped` : ''}.` });
      } else {
        toast({ title: 'No payslips to include in the ZIP.', variant: 'destructive' });
      }
    } catch (e) {
      toast({ title: 'ZIP download failed', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setArchivingOwnerId(null);
    }
  };

  return (
    <div className="max-w-[1600px] mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><Wallet className="w-5 h-5 text-muted-foreground" />Crew Payroll</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Monthly payroll status across all vessels under your supervision. Select vessels without a payroll period yet to generate in bulk, then review and confirm, or download an owner/fleet/vessel-level claim.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Pay Month</Label>
          <Input type="month" value={yearMonth} onChange={e => { setYearMonth(e.target.value); setSelectedIds([]); }} className="h-7 text-xs w-40" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Owner</Label>
          <Select value={ownerFilter || '_all'} onValueChange={v => handleOwnerFilterChange(v === '_all' ? '' : v)}>
            <SelectTrigger className="h-7 text-xs w-40"><SelectValue placeholder="All" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">All</SelectItem>
              {owners.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Fleet</Label>
          <Select value={fleetFilter || '_all'} onValueChange={v => setFleetFilter(v === '_all' ? '' : v)}>
            <SelectTrigger className="h-7 text-xs w-40"><SelectValue placeholder="All" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">All</SelectItem>
              {fleetsForOwnerFilter.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Search Vessel</Label>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Vessel name" className="h-7 text-xs w-44 pl-7" />
          </div>
        </div>
        <div className="flex-1" />
        <Button size="sm" variant="outline" className="gap-1.5 h-7" onClick={() => setBillingOpen(true)}>
          <FileSpreadsheet className="w-3.5 h-3.5" />Export Claim
        </Button>
      </div>

      {selectedIds.length > 0 && (
        <div className="flex items-center justify-between gap-2 flex-wrap bg-blue-50 border border-blue-200 rounded-md px-4 py-2">
          <span className="text-xs font-medium text-blue-800">{selectedIds.length} vessel(s) selected</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {generatableIds.length > 0 && (
              <Button size="sm" className="h-7 text-xs gap-1" onClick={handleBulkGenerate} disabled={generating}>
                <RefreshCw className="w-3.5 h-3.5" />{generating ? 'Generating...' : `Bulk Generate (${generatableIds.length})`}
              </Button>
            )}
            {confirmableIds.length > 0 && (
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1 bg-white text-green-700 border-green-300" onClick={handleBulkConfirm} disabled={confirming}>
                <CheckCircle2 className="w-3.5 h-3.5" />{confirming ? 'Confirming...' : `Bulk Confirm (${confirmableIds.length})`}
              </Button>
            )}
            {invalidatableIds.length > 0 && (
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1 bg-white text-red-600 border-red-300" onClick={handleBulkInvalidate} disabled={invalidating}>
                <Ban className="w-3.5 h-3.5" />{invalidating ? 'Invalidating...' : `Invalidate (${invalidatableIds.length})`}
              </Button>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
      ) : filteredRows.length === 0 ? (
        <div className="text-center py-12 text-sm text-gray-400">No vessels match the current filters.</div>
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
                <TableHead className="py-1 px-2 text-xs whitespace-nowrap">Fleet</TableHead>
                <TableHead className="py-1 px-2 text-xs whitespace-nowrap">Vessel</TableHead>
                <TableHead className="py-1 px-2 text-xs whitespace-nowrap">Status</TableHead>
                <TableHead className="py-1 px-2 text-xs text-center whitespace-nowrap">Crew</TableHead>
                <TableHead className="py-1 px-2 text-xs text-right whitespace-nowrap">Total Net Pay</TableHead>
                <TableHead className="py-1 px-2 text-xs text-right whitespace-nowrap">Total Owner Billed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ownerGroups.map(group => {
                const groupIds = group.rows.map(r => r.ship_id);
                const confirmedCount = group.rows.filter(r => r.status === 'confirmed').length;
                return (
                  <Fragment key={group.ownerId}>
                    <TableRow className="bg-slate-50 hover:bg-slate-50">
                      <TableCell className="py-1 px-2" onClick={e => e.stopPropagation()}>
                        <Checkbox
                          checked={groupIds.length > 0 && groupIds.every(id => selectedIds.includes(id))}
                          onCheckedChange={checked => setSelectedIds(prev => checked ? [...new Set([...prev, ...groupIds])] : prev.filter(id => !groupIds.includes(id)))}
                        />
                      </TableCell>
                      <TableCell colSpan={5} className="py-1 px-2 text-xs font-semibold text-slate-700">
                        {group.ownerName}
                        <span className="ml-2 font-normal text-slate-500">({group.rows.length} vessels · {confirmedCount}/{group.rows.length} confirmed)</span>
                      </TableCell>
                      <TableCell colSpan={2} className="py-1 px-2 text-right" onClick={e => e.stopPropagation()}>
                        <Button
                          size="sm" variant="outline" className="h-6 text-[11px] gap-1 bg-white"
                          onClick={() => handleDownloadOwnerZip(group)}
                          disabled={archivingOwnerId === group.ownerId || !group.rows.some(r => r.period_id)}
                        >
                          <Archive className="w-3 h-3" />{archivingOwnerId === group.ownerId ? 'Zipping...' : 'Download ZIP'}
                        </Button>
                      </TableCell>
                    </TableRow>
                    {group.rows.map(row => (
                      <TableRow key={row.ship_id} className="cursor-pointer" onClick={() => openShip(row)}>
                        <TableCell className="py-1 px-2" onClick={e => e.stopPropagation()}>
                          <Checkbox checked={selectedIds.includes(row.ship_id)} onCheckedChange={() => toggleSelect(row.ship_id)} />
                        </TableCell>
                        <TableCell className="py-1 px-2 text-xs text-muted-foreground">{row.fleet_name || '-'}</TableCell>
                        <TableCell className="py-1 px-2 text-xs font-medium">{row.ship_name}</TableCell>
                        <TableCell className="py-1 px-2"><Badge variant="outline" className={`text-[11px] ${STATUS_COLORS[row.status]}`}>{STATUS_LABELS[row.status]}</Badge></TableCell>
                        <TableCell className="py-1 px-2 text-xs text-center">{row.payslip_count > 0 ? row.payslip_count : '-'}</TableCell>
                        <TableCell className="py-1 px-2 text-xs text-right font-mono">{row.total_net_amount > 0 ? fmt(row.total_net_amount) : '-'}</TableCell>
                        <TableCell className="py-1 px-2 text-xs text-right font-mono text-orange-700">{row.total_owner_billed > 0 ? fmt(row.total_owner_billed) : '-'}</TableCell>
                      </TableRow>
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
          <DialogHeader><DialogTitle className="text-base">Bulk Generation Result</DialogTitle></DialogHeader>
          {genResult && (
            <div className="space-y-3 text-sm">
              <p>Succeeded {genResult.succeeded.length} / Skipped {genResult.skipped.length} / Failed {genResult.failed.length}</p>
              {genResult.skipped.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">Skipped</p>
                  <ul className="text-xs text-gray-500 space-y-0.5">
                    {genResult.skipped.map(s => (
                      <li key={s.shipId}>{ships.find(sh => sh.id === s.shipId)?.name || s.shipId} — {s.reason === 'no_crew' ? 'No crew on board this month' : 'Period already exists'}</li>
                    ))}
                  </ul>
                </div>
              )}
              {genResult.failed.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-red-500 mb-1">Failed</p>
                  <ul className="text-xs text-red-500 space-y-0.5">
                    {genResult.failed.map(f => (
                      <li key={f.shipId}>{ships.find(sh => sh.id === f.shipId)?.name || f.shipId} — {f.error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <DialogFooter><Button size="sm" onClick={() => setGenResult(null)}>OK</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={billingOpen} onOpenChange={o => !billingExporting && setBillingOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-base">Export Claim</DialogTitle></DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs">Group By</Label>
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
              <Label className="text-xs">Target</Label>
              <Select value={billingGroupId} onValueChange={setBillingGroupId}>
                <SelectTrigger className="h-7 text-xs w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {billingTargetOptions.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setBillingOpen(false)} disabled={billingExporting}>Cancel</Button>
            <Button size="sm" className="gap-1.5" onClick={handleExportBilling} disabled={billingExporting}>
              <FileSpreadsheet className="w-3.5 h-3.5" />{billingExporting ? 'Exporting...' : 'Download Excel'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
