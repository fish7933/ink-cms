import { useState, useEffect, useCallback, useMemo } from 'react';
import { PiggyBank, History } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { getCurrentUser, getShips } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { supervisorService } from '@/services/supervisor.service';
import { crewPayrollService } from '@/services/crew-payroll.service';
import type { Ship } from '@/lib/store';
import type { CrewDeferredPayRow, CrewPayrollHistoryRow, CrewDeferredPayHistoryRow } from '@/types/crew-payroll';

const fmtDate = (d: string) => d?.slice(5).replace('-', '/') || '';

const fmt = (n: number) => n.toLocaleString('ko-KR');
const currentYearMonth = () => new Date().toISOString().slice(0, 7);
const PAGE_SIZE = 20;
const STATUS_LABELS: Record<string, string> = { draft: '작성중', pending_approval: '결재중', confirmed: '확정' };
const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  pending_approval: 'bg-purple-50 text-purple-700 border-purple-200',
  confirmed: 'bg-green-50 text-green-700 border-green-200',
};

// 후불성(휴가비 등) 급여 항목의 회사 내부 현황 — 그 달에 각 선원별로 얼마나 적립됐는지,
// 승선일부터 지금까지 얼마나 쌓여있는지(=우리가 나중에 지급해야 할 부채성 잔액), 하선 등으로
// 그 달에 실제 얼마나 지급됐는지를 한눈에 본다. 선주/매닝사와 공유하지 않는 내부 전용 화면.
export default function CrewDeferredPayReportPage() {
  const { toast } = useToast();
  const [ships, setShips] = useState<Ship[]>([]);
  const [owners, setOwners] = useState<Map<string, string>>(new Map());
  const [fleets, setFleets] = useState<Map<string, string>>(new Map());
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [rows, setRows] = useState<CrewDeferredPayRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [ownerFilter, setOwnerFilter] = useState('');
  const [fleetFilter, setFleetFilter] = useState('');
  const [shipFilter, setShipFilter] = useState('');
  const [itemFilter, setItemFilter] = useState('');
  const [page, setPage] = useState(1);

  // 선원 이름 클릭 → 급여명세 히스토리 + 후불성 적립 히스토리 전체, 항목 클릭 → 그 항목만의 적립 히스토리.
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyMode, setHistoryMode] = useState<'crew' | 'item'>('crew');
  const [historyCrewName, setHistoryCrewName] = useState('');
  const [historyItemName, setHistoryItemName] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [payrollHistoryRows, setPayrollHistoryRows] = useState<CrewPayrollHistoryRow[]>([]);
  const [deferredHistoryRows, setDeferredHistoryRows] = useState<CrewDeferredPayHistoryRow[]>([]);

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
        ownerIds.length > 0 ? supabase.from('companies').select('id, name').in('id', ownerIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        fleetIds.length > 0 ? supabase.from('fleets').select('id, name').in('id', fleetIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      ]);
      setOwners(new Map((ownerRows || []).map(o => [o.id, o.name])));
      setFleets(new Map((fleetRows || []).map(f => [f.id, f.name])));
    })();
  }, []);

  const loadRows = useCallback(async (ym: string, shipList: Ship[]) => {
    if (shipList.length === 0) { setRows([]); setLoading(false); return; }
    setLoading(true);
    try {
      const data = await crewPayrollService.getDeferredPayReport(ym, shipList.map(s => ({
        id: s.id, name: s.name,
        owner_id: s.owner_id, owner_name: s.owner_id ? owners.get(s.owner_id) : undefined,
        fleet_id: s.fleet_id, fleet_name: s.fleet_id ? fleets.get(s.fleet_id) : undefined,
      })));
      setRows(data);
    } catch (e) {
      toast({ title: '조회 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast, owners, fleets]);

  useEffect(() => { loadRows(yearMonth, ships); }, [yearMonth, ships, loadRows]);

  const handleOwnerFilterChange = (id: string) => { setOwnerFilter(id); setFleetFilter(''); setShipFilter(''); };
  const handleFleetFilterChange = (id: string) => { setFleetFilter(id); setShipFilter(''); };

  const fleetList = useMemo(() => [...fleets.entries()].map(([id, name]) => ({ id, name })), [fleets]);
  const fleetsForOwnerFilter = ownerFilter ? fleetList.filter(f => ships.some(s => s.owner_id === ownerFilter && s.fleet_id === f.id)) : fleetList;
  const shipsForFilter = ships.filter(s => (!ownerFilter || s.owner_id === ownerFilter) && (!fleetFilter || s.fleet_id === fleetFilter));
  const itemOptions = useMemo(() => [...new Set(rows.map(r => r.item_name))].sort(), [rows]);

  const filteredRows = useMemo(() => rows.filter(r =>
    (!ownerFilter || r.owner_id === ownerFilter) &&
    (!fleetFilter || r.fleet_id === fleetFilter) &&
    (!shipFilter || r.ship_id === shipFilter) &&
    (!itemFilter || r.item_name === itemFilter)
  ), [rows, ownerFilter, fleetFilter, shipFilter, itemFilter]);

  useEffect(() => { setPage(1); }, [yearMonth, ownerFilter, fleetFilter, shipFilter, itemFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pagedRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const totals = useMemo(() => ({
    accrual: filteredRows.reduce((s, r) => s + r.monthly_accrual, 0),
    balance: filteredRows.reduce((s, r) => s + (r.payout_this_month > 0 ? 0 : r.accrued_to_date), 0),
    payout: filteredRows.reduce((s, r) => s + r.payout_this_month, 0),
  }), [filteredRows]);

  const openCrewHistory = async (r: CrewDeferredPayRow) => {
    setHistoryMode('crew');
    setHistoryCrewName(r.crew_name);
    setHistoryItemName('');
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const [payroll, deferred] = await Promise.all([
        crewPayrollService.getCrewPayrollHistory(r.crew_member_id),
        crewPayrollService.getCrewDeferredPayHistory(r.crew_member_id),
      ]);
      setPayrollHistoryRows(payroll);
      setDeferredHistoryRows(deferred);
    } finally {
      setHistoryLoading(false);
    }
  };

  const openItemHistory = async (r: CrewDeferredPayRow) => {
    setHistoryMode('item');
    setHistoryCrewName(r.crew_name);
    setHistoryItemName(r.item_name);
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      setDeferredHistoryRows(await crewPayrollService.getCrewDeferredPayHistory(r.crew_member_id, r.item_name));
    } finally {
      setHistoryLoading(false);
    }
  };

  // 급여명세 히스토리도 급여대장과 동일하게 항목명별 열을 펼친다(월마다 적용 템플릿이
  // 달라질 수 있어 전체 이력에 등장한 항목명의 합집합을 열로 만든다). (Accrued) 열은
  // 합산하면 누적 적립 총액이 되어버리므로 합계 칸에는 표기하지 않는다.
  const payrollHistoryAllowanceColumns = useMemo(() => {
    const cols: string[] = [];
    for (const r of payrollHistoryRows) for (const name of Object.keys(r.allowance_by_name)) if (!cols.includes(name)) cols.push(name);
    return cols;
  }, [payrollHistoryRows]);
  const payrollHistoryDeductionColumns = useMemo(() => {
    const cols: string[] = [];
    for (const r of payrollHistoryRows) for (const name of Object.keys(r.deduction_by_name)) if (!cols.includes(name)) cols.push(name);
    return cols;
  }, [payrollHistoryRows]);
  const payrollHistoryTotals = useMemo(() => ({
    allowanceByName: payrollHistoryAllowanceColumns.reduce((acc, name) => { acc[name] = payrollHistoryRows.reduce((s, r) => s + (r.allowance_by_name[name] || 0), 0); return acc; }, {} as Record<string, number>),
    deductionByName: payrollHistoryDeductionColumns.reduce((acc, name) => { acc[name] = payrollHistoryRows.reduce((s, r) => s + (r.deduction_by_name[name] || 0), 0); return acc; }, {} as Record<string, number>),
    gross: payrollHistoryRows.reduce((s, r) => s + r.gross_amount, 0),
    deduction: payrollHistoryRows.reduce((s, r) => s + r.total_deduction, 0),
    net: payrollHistoryRows.reduce((s, r) => s + r.net_amount, 0),
  }), [payrollHistoryRows, payrollHistoryAllowanceColumns, payrollHistoryDeductionColumns]);

  return (
    <div className="max-w-[1400px] mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><PiggyBank className="w-5 h-5 text-muted-foreground" />선원 후불성 급여 현황</h1>
        <p className="text-xs text-muted-foreground mt-1">
          휴가비 등 후불성 급여 항목이 선원별로 매달 얼마나 적립되고, 현재 잔액이 얼마이며, 하선 등으로 그 달에 실제 얼마나 지급됐는지 보여줍니다.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">기준 월</Label>
          <Input type="month" value={yearMonth} onChange={e => setYearMonth(e.target.value)} className="h-7 text-xs w-40" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">선주</Label>
          <Select value={ownerFilter || '_all'} onValueChange={v => handleOwnerFilterChange(v === '_all' ? '' : v)}>
            <SelectTrigger className="h-7 text-xs w-36"><SelectValue placeholder="전체" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">전체</SelectItem>
              {[...owners.entries()].map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">플릿</Label>
          <Select value={fleetFilter || '_all'} onValueChange={v => handleFleetFilterChange(v === '_all' ? '' : v)}>
            <SelectTrigger className="h-7 text-xs w-36"><SelectValue placeholder="전체" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">전체</SelectItem>
              {fleetsForOwnerFilter.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">선박</Label>
          <Select value={shipFilter || '_all'} onValueChange={v => setShipFilter(v === '_all' ? '' : v)}>
            <SelectTrigger className="h-7 text-xs w-40"><SelectValue placeholder="전체" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">전체</SelectItem>
              {shipsForFilter.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">항목</Label>
          <Select value={itemFilter || '_all'} onValueChange={v => setItemFilter(v === '_all' ? '' : v)}>
            <SelectTrigger className="h-7 text-xs w-32"><SelectValue placeholder="전체" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">전체</SelectItem>
              {itemOptions.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">이번 달 적립액 합계</p>
          <p className="text-lg font-bold mt-1">{fmt(totals.accrual)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">현재 누적 잔액(미지급) 합계</p>
          <p className="text-lg font-bold mt-1 text-amber-700">{fmt(totals.balance)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">이번 달 일괄 지급액 합계</p>
          <p className="text-lg font-bold mt-1 text-green-700">{fmt(totals.payout)}</p>
        </CardContent></Card>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
      ) : filteredRows.length === 0 ? (
        <div className="text-center py-12 text-sm text-gray-400">
          {rows.length === 0 ? '이 달에 후불성 급여 항목이 있는 명세서가 없습니다.' : '현재 필터 조건에 맞는 항목이 없습니다.'}
        </div>
      ) : (
        <div className="rounded-md border overflow-hidden overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="py-1 px-2 text-xs whitespace-nowrap">선주</TableHead>
                <TableHead className="py-1 px-2 text-xs whitespace-nowrap">플릿</TableHead>
                <TableHead className="py-1 px-2 text-xs whitespace-nowrap">선박</TableHead>
                <TableHead className="py-1 px-2 text-xs whitespace-nowrap">직급</TableHead>
                <TableHead className="py-1 px-2 text-xs whitespace-nowrap">선원</TableHead>
                <TableHead className="py-1 px-2 text-xs whitespace-nowrap">항목</TableHead>
                <TableHead className="py-1 px-2 text-xs whitespace-nowrap">승선일</TableHead>
                <TableHead className="py-1 px-2 text-xs whitespace-nowrap">하선일</TableHead>
                <TableHead className="py-1 px-2 text-xs text-right whitespace-nowrap">이번 달 적립액</TableHead>
                <TableHead className="py-1 px-2 text-xs text-right whitespace-nowrap">누적 잔액</TableHead>
                <TableHead className="py-1 px-2 text-xs text-right whitespace-nowrap">이번 달 지급액</TableHead>
                <TableHead className="py-1 px-2 text-xs text-center whitespace-nowrap">이력</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedRows.map((r, idx) => (
                <TableRow key={`${r.crew_member_id}-${r.item_name}-${idx}`}>
                  <TableCell className="py-1 px-2 text-xs text-muted-foreground">{r.owner_name || '-'}</TableCell>
                  <TableCell className="py-1 px-2 text-xs text-muted-foreground">{r.fleet_name || '-'}</TableCell>
                  <TableCell className="py-1 px-2 text-xs text-muted-foreground">{r.ship_name}</TableCell>
                  <TableCell className="py-1 px-2 text-xs text-muted-foreground">{r.rank_code}</TableCell>
                  <TableCell className="py-1 px-2 text-xs font-medium">{r.crew_name}</TableCell>
                  <TableCell className="py-1 px-2 text-xs cursor-pointer hover:underline hover:text-blue-700" onClick={() => openItemHistory(r)}>{r.item_name}</TableCell>
                  <TableCell className="py-1 px-2 text-xs text-muted-foreground">{fmtDate(r.embark_date)}</TableCell>
                  <TableCell className="py-1 px-2 text-xs text-muted-foreground">{r.disembark_date ? fmtDate(r.disembark_date) : '-'}</TableCell>
                  <TableCell className="py-1 px-2 text-xs text-right font-mono">{fmt(r.monthly_accrual)}</TableCell>
                  <TableCell className="py-1 px-2 text-xs text-right font-mono text-amber-700">
                    {r.payout_this_month > 0 ? '0 (지급완료)' : fmt(r.accrued_to_date)}
                  </TableCell>
                  <TableCell className="py-1 px-2 text-xs text-right font-mono text-green-700">{r.payout_this_month > 0 ? fmt(r.payout_this_month) : '-'}</TableCell>
                  <TableCell className="py-1 px-2 text-center">
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="급여명세/적립 히스토리" onClick={() => openCrewHistory(r)}>
                      <History className="w-3.5 h-3.5 text-muted-foreground" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {!loading && filteredRows.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            총 {filteredRows.length}건 중 {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, filteredRows.length)}건 표시
          </p>
          {totalPages > 1 && (
            <Pagination className="mx-0 w-auto">
              <PaginationContent>
                <PaginationItem><PaginationPrevious onClick={() => page > 1 && setPage(page - 1)} className={page === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'} /></PaginationItem>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => {
                  if (p === 1 || p === totalPages || (p >= page - 1 && p <= page + 1)) {
                    return <PaginationItem key={p}><PaginationLink onClick={() => setPage(p)} isActive={page === p} className="cursor-pointer">{p}</PaginationLink></PaginationItem>;
                  } else if (p === page - 2 || p === page + 2) {
                    return <PaginationItem key={p}><span className="px-4">...</span></PaginationItem>;
                  }
                  return null;
                })}
                <PaginationItem><PaginationNext onClick={() => page < totalPages && setPage(page + 1)} className={page === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'} /></PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </div>
      )}

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-6xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-1.5">
              <History className="w-4 h-4 text-muted-foreground" />
              {historyMode === 'crew' ? `${historyCrewName} — 급여명세 / 후불성 적립 히스토리` : `${historyCrewName} — ${historyItemName} 적립 히스토리`}
            </DialogTitle>
          </DialogHeader>
          {historyLoading ? (
            <div className="flex items-center justify-center py-10"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" /></div>
          ) : (
            <div className="space-y-5">
              {historyMode === 'crew' && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1.5">급여명세 히스토리</p>
                  {payrollHistoryRows.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-6">급여명세 이력이 없습니다.</p>
                  ) : (
                    <div className="rounded-md border overflow-hidden overflow-x-auto">
                      <table className="w-full text-xs whitespace-nowrap">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="text-left p-2 font-medium text-gray-600">월</th>
                            <th className="text-left p-2 font-medium text-gray-600">선박</th>
                            <th className="text-left p-2 font-medium text-gray-600">상태</th>
                            <th className="text-left p-2 font-medium text-gray-600">급여적용기간</th>
                            <th className="text-left p-2 font-medium text-gray-600">적용일수</th>
                            {payrollHistoryAllowanceColumns.map(name => <th key={name} className="text-right p-2 font-medium text-gray-600">{name}</th>)}
                            <th className="text-right p-2 font-medium text-gray-700 bg-gray-100">지급 합계</th>
                            {payrollHistoryDeductionColumns.map(name => <th key={name} className="text-right p-2 font-medium text-red-600">{name}</th>)}
                            <th className="text-right p-2 font-medium text-red-700 bg-gray-100">공제 합계</th>
                            <th className="text-right p-2 font-medium text-gray-700 bg-gray-100">실지급액</th>
                          </tr>
                        </thead>
                        <tbody>
                          {payrollHistoryRows.map(r => (
                            <tr key={r.period_id} className="border-b">
                              <td className="py-1 px-2">{r.year_month}</td>
                              <td className="py-1 px-2 text-gray-600">{r.ship_name}</td>
                              <td className="py-1 px-2"><Badge variant="outline" className={`text-[11px] ${STATUS_COLORS[r.status]}`}>{STATUS_LABELS[r.status]}</Badge></td>
                              <td className="py-1 px-2 text-gray-600">{r.period_start_date}~{r.period_end_date}</td>
                              <td className="py-1 px-2 text-gray-600">{r.days_served}/{r.days_in_month}</td>
                              {payrollHistoryAllowanceColumns.map(name => <td key={name} className="py-1 px-2 text-right font-mono">{fmt(r.allowance_by_name[name] || 0)}</td>)}
                              <td className="py-1 px-2 text-right font-mono font-semibold bg-gray-50">{fmt(r.gross_amount)}</td>
                              {payrollHistoryDeductionColumns.map(name => <td key={name} className="py-1 px-2 text-right font-mono text-red-600">{fmt(r.deduction_by_name[name] || 0)}</td>)}
                              <td className="py-1 px-2 text-right font-mono font-semibold text-red-600 bg-gray-50">{fmt(r.total_deduction)}</td>
                              <td className="py-1 px-2 text-right font-mono font-semibold bg-gray-50">{fmt(r.net_amount)}</td>
                            </tr>
                          ))}
                          {/* (Accrued) 열은 월별 적립액만 표기 대상이라 합산하면 곧 누적 적립 총액이 되어버린다 —
                              급여대장에는 총적립액을 노출하지 않기로 했으므로 합계 칸은 비워둔다. */}
                          <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                            <td className="py-1 px-2" colSpan={5}>합계 ({payrollHistoryRows.length}개월)</td>
                            {payrollHistoryAllowanceColumns.map(name => (
                              <td key={name} className="py-1 px-2 text-right font-mono">
                                {name.endsWith('(Accrued)') ? <span className="text-gray-300">-</span> : fmt(payrollHistoryTotals.allowanceByName[name] || 0)}
                              </td>
                            ))}
                            <td className="py-1 px-2 text-right font-mono">{fmt(payrollHistoryTotals.gross)}</td>
                            {payrollHistoryDeductionColumns.map(name => <td key={name} className="py-1 px-2 text-right font-mono text-red-600">{fmt(payrollHistoryTotals.deductionByName[name] || 0)}</td>)}
                            <td className="py-1 px-2 text-right font-mono text-red-600">{fmt(payrollHistoryTotals.deduction)}</td>
                            <td className="py-1 px-2 text-right font-mono">{fmt(payrollHistoryTotals.net)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              <div>
                {historyMode === 'crew' && <p className="text-xs font-medium text-gray-500 mb-1.5">후불성 적립 히스토리</p>}
                {deferredHistoryRows.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-6">후불성 적립 이력이 없습니다.</p>
                ) : (
                  <div className="rounded-md border overflow-hidden overflow-x-auto">
                    <table className="w-full text-xs whitespace-nowrap">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="text-left p-2 font-medium text-gray-600">월</th>
                          <th className="text-left p-2 font-medium text-gray-600">선박</th>
                          <th className="text-left p-2 font-medium text-gray-600">상태</th>
                          {historyMode === 'crew' && <th className="text-left p-2 font-medium text-gray-600">항목</th>}
                          <th className="text-right p-2 font-medium text-gray-600">적립액</th>
                          <th className="text-right p-2 font-medium text-amber-700">누적 잔액</th>
                          <th className="text-right p-2 font-medium text-green-700">지급액</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deferredHistoryRows.map((r, idx) => (
                          <tr key={`${r.period_id}-${r.item_name}-${idx}`} className="border-b">
                            <td className="py-1 px-2">{r.year_month}</td>
                            <td className="py-1 px-2 text-gray-600">{r.ship_name}</td>
                            <td className="py-1 px-2"><Badge variant="outline" className={`text-[11px] ${STATUS_COLORS[r.status]}`}>{STATUS_LABELS[r.status]}</Badge></td>
                            {historyMode === 'crew' && <td className="py-1 px-2">{r.item_name}</td>}
                            <td className="py-1 px-2 text-right font-mono">{fmt(r.monthly_accrual)}</td>
                            <td className="py-1 px-2 text-right font-mono text-amber-700">{r.payout_this_month > 0 ? '0 (지급완료)' : fmt(r.accrued_to_date)}</td>
                            <td className="py-1 px-2 text-right font-mono text-green-700">{r.payout_this_month > 0 ? fmt(r.payout_this_month) : '-'}</td>
                          </tr>
                        ))}
                        <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                          <td className="py-1 px-2" colSpan={historyMode === 'crew' ? 4 : 3}>합계 ({deferredHistoryRows.length}건)</td>
                          <td className="py-1 px-2 text-right font-mono">{fmt(deferredHistoryRows.reduce((s, r) => s + r.monthly_accrual, 0))}</td>
                          <td className="py-1 px-2 text-right font-mono"><span className="text-gray-300">-</span></td>
                          <td className="py-1 px-2 text-right font-mono text-green-700">{fmt(deferredHistoryRows.reduce((s, r) => s + r.payout_this_month, 0))}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
