import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import { Receipt, RefreshCw, Trash2, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { getCurrentUser, getShips } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { supervisorService } from '@/services/supervisor.service';
import {
  managementFeeCalcService,
  type ManagementFeeDashboardRow,
  type GenerateManagementFeeResult,
  type ManagementFeeLedgerData,
} from '@/services/management-fee-calc.service';
import type { Ship } from '@/lib/store';

const STATUS_LABELS: Record<string, string> = { none: '미생성', draft: '임시저장' };
const STATUS_COLORS: Record<string, string> = {
  none: 'bg-gray-50 text-gray-400 border-gray-200',
  draft: 'bg-yellow-50 text-yellow-700 border-yellow-200',
};
const fmt = (n: number) => n.toLocaleString('en-US');
const currentYearMonth = () => new Date().toISOString().slice(0, 7);

// 관리비 계산 대시보드 — 담당 선박 전체를 한 화면에서 보고, 아직 계산되지 않은 달은
// 선택해서 일괄 계산할 수 있다. 실제 청구서 발행 이전 검증/미리보기 화면이며,
// 회차 상태는 'draft' 하나뿐이라 급여 대시보드와 달리 확정/승인 단계는 없다.
export default function ManagementFeeCalculationPage() {
  const { toast } = useToast();

  const [ships, setShips] = useState<Ship[]>([]);
  const [owners, setOwners] = useState<{ id: string; name: string }[]>([]);
  const [fleets, setFleets] = useState<{ id: string; name: string }[]>([]);
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [rows, setRows] = useState<ManagementFeeDashboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const [ownerFilter, setOwnerFilter] = useState('');
  const [fleetFilter, setFleetFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [genResult, setGenResult] = useState<GenerateManagementFeeResult | null>(null);

  const [ledgerPeriodId, setLedgerPeriodId] = useState<string | null>(null);
  const [ledgerData, setLedgerData] = useState<ManagementFeeLedgerData | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
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
      const data = await managementFeeCalcService.getDashboardRows(ym, shipList.map(s => ({ id: s.id, name: s.name, owner_id: s.owner_id, fleet_id: s.fleet_id })));
      setRows(data);
    } catch (e) {
      toast({ title: '불러오기 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setLoading(false);
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

  const generatableIds = filteredRows.filter(r => selectedIds.includes(r.ship_id) && r.status === 'none').map(r => r.ship_id);
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
      await loadRows(yearMonth, ships);
    } catch (e) {
      toast({ title: '일괄 계산 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setGenerating(false);
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

  const handleRegenerate = async () => {
    if (!ledgerPeriodId) return;
    setRegenerating(true);
    try {
      const user = await getCurrentUser();
      if (!user) return;
      await managementFeeCalcService.regeneratePeriod(ledgerPeriodId, user.id);
      toast({ title: '재계산 완료' });
      await loadRows(yearMonth, ships);
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
      await managementFeeCalcService.deletePeriod(ledgerPeriodId);
      toast({ title: '삭제 완료' });
      setLedgerPeriodId(null);
      setLedgerData(null);
      await loadRows(yearMonth, ships);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-[1600px] mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-4">
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

      {selectedIds.length > 0 && (
        <div className="flex items-center justify-between gap-2 flex-wrap bg-blue-50 border border-blue-200 rounded-md px-4 py-2">
          <span className="text-xs font-medium text-blue-800">{selectedIds.length}척 선택됨</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {generatableIds.length > 0 && (
              <Button size="sm" className="h-7 text-xs gap-1" onClick={handleBulkGenerate} disabled={generating}>
                <RefreshCw className="w-3.5 h-3.5" />{generating ? '계산 중...' : `일괄 계산 (${generatableIds.length})`}
              </Button>
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
                return (
                  <Fragment key={group.ownerId}>
                    <TableRow className="bg-slate-50 hover:bg-slate-50">
                      <TableCell className="py-1 px-2" onClick={e => e.stopPropagation()}>
                        <Checkbox
                          checked={groupIds.length > 0 && groupIds.every(id => selectedIds.includes(id))}
                          onCheckedChange={checked => setSelectedIds(prev => checked ? [...new Set([...prev, ...groupIds])] : prev.filter(id => !groupIds.includes(id)))}
                        />
                      </TableCell>
                      <TableCell colSpan={4} className="py-1 px-2 text-xs font-semibold text-slate-700">
                        {group.ownerName}
                        <span className="ml-2 font-normal text-slate-500">({group.rows.length}척)</span>
                      </TableCell>
                    </TableRow>
                    {group.rows.map(row => (
                      <TableRow key={row.ship_id} className={`cursor-pointer ${ledgerPeriodId === row.period_id ? 'bg-blue-50/60' : ''}`} onClick={() => openShip(row)}>
                        <TableCell className="py-1 px-2" onClick={e => e.stopPropagation()}>
                          <Checkbox checked={selectedIds.includes(row.ship_id)} onCheckedChange={() => toggleSelect(row.ship_id)} />
                        </TableCell>
                        <TableCell className="py-1 px-2 text-xs text-muted-foreground">{row.fleet_name || '-'}</TableCell>
                        <TableCell className="py-1 px-2 text-xs font-medium">{row.ship_name}</TableCell>
                        <TableCell className="py-1 px-2"><Badge variant="outline" className={`text-[11px] ${STATUS_COLORS[row.status]}`}>{STATUS_LABELS[row.status]}</Badge></TableCell>
                        <TableCell className="py-1 px-2 text-xs text-center">{row.line_count > 0 ? row.line_count : '-'}</TableCell>
                      </TableRow>
                    ))}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* 선택된 선박의 선원×항목 상세 내역 (미리보기) */}
      {ledgerPeriodId && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                {ledgerData ? `${[ledgerData.owner_name, ledgerData.fleet_name, ledgerData.ship_name].filter(Boolean).join(' > ')} — ${yearMonth}` : '불러오는 중...'}
              </CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={handleRegenerate} disabled={regenerating}>
                  <RefreshCw className="w-3.5 h-3.5" />{regenerating ? '재계산 중...' : '재계산'}
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs text-red-600 border-red-300 hover:bg-red-50" onClick={handleDelete} disabled={deleting}>
                  <Trash2 className="w-3.5 h-3.5" />삭제
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setLedgerPeriodId(null); setLedgerData(null); }}>
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {ledgerLoading || !ledgerData ? (
              <div className="text-center py-8 text-sm text-gray-400">불러오는 중...</div>
            ) : (
              <>
                {/* 항목별 합계 (상한 적용 여부) */}
                {ledgerData.item_totals.length > 0 && (
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">청구 항목</TableHead>
                          <TableHead className="text-xs text-right">전 선원 합계</TableHead>
                          <TableHead className="text-xs text-right">상한</TableHead>
                          <TableHead className="text-xs text-right">청구 금액</TableHead>
                          <TableHead className="text-xs">비고</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ledgerData.item_totals.map(t => (
                          <TableRow key={`${t.fee_item_id}-${t.currency}`}>
                            <TableCell className="text-xs font-medium">{t.fee_item_name}</TableCell>
                            <TableCell className="text-xs text-right font-mono">{fmt(t.raw_total)} {t.currency}</TableCell>
                            <TableCell className="text-xs text-right font-mono">{t.cap_amount != null ? `${fmt(t.cap_amount)} ${t.currency}` : '-'}</TableCell>
                            <TableCell className="text-xs text-right font-mono font-semibold">{fmt(t.billed_total)} {t.currency}</TableCell>
                            <TableCell className="text-xs">{t.was_capped && <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300 bg-amber-50">상한 적용됨</Badge>}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {/* 선원별 상세 (피벗) */}
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs whitespace-nowrap">직급</TableHead>
                        <TableHead className="text-xs whitespace-nowrap">이름</TableHead>
                        <TableHead className="text-xs whitespace-nowrap">국적</TableHead>
                        <TableHead className="text-xs whitespace-nowrap">승선일</TableHead>
                        {ledgerData.fee_item_columns.map(col => (
                          <TableHead key={col} className="text-xs text-right whitespace-nowrap">{col}</TableHead>
                        ))}
                        <TableHead className="text-xs text-right whitespace-nowrap">합계</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ledgerData.rows.length === 0 ? (
                        <TableRow><TableCell colSpan={5 + ledgerData.fee_item_columns.length} className="text-center py-6 text-xs text-gray-400">계산된 라인이 없습니다.</TableCell></TableRow>
                      ) : ledgerData.rows.map(row => (
                        <TableRow key={row.crew_member_id + row.embark_date}>
                          <TableCell className="text-xs">{row.rank_code}</TableCell>
                          <TableCell className="text-xs font-medium">{row.crew_name}</TableCell>
                          <TableCell className="text-xs">{row.nationality || '-'}</TableCell>
                          <TableCell className="text-xs">{row.embark_date}{row.disembark_date ? ` ~ ${row.disembark_date}` : ''}</TableCell>
                          {ledgerData.fee_item_columns.map(col => (
                            <TableCell key={col} className="text-xs text-right font-mono">
                              {row.item_amounts[col] == null ? (col in row.item_amounts ? '수기입력' : '-') : fmt(row.item_amounts[col]!)}
                            </TableCell>
                          ))}
                          <TableCell className="text-xs text-right font-mono font-semibold">{fmt(row.total_amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
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
