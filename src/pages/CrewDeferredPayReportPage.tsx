import { useState, useEffect, useCallback, useMemo } from 'react';
import { PiggyBank } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { useToast } from '@/hooks/use-toast';
import { getCurrentUser, getShips } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { supervisorService } from '@/services/supervisor.service';
import { crewPayrollService } from '@/services/crew-payroll.service';
import type { Ship } from '@/lib/store';
import type { CrewDeferredPayRow } from '@/types/crew-payroll';

const fmtDate = (d: string) => d?.slice(5).replace('-', '/') || '';

const fmt = (n: number) => n.toLocaleString('ko-KR');
const currentYearMonth = () => new Date().toISOString().slice(0, 7);
const PAGE_SIZE = 20;

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
                  <TableCell className="py-1 px-2 text-xs">{r.item_name}</TableCell>
                  <TableCell className="py-1 px-2 text-xs text-muted-foreground">{fmtDate(r.embark_date)}</TableCell>
                  <TableCell className="py-1 px-2 text-xs text-muted-foreground">{r.disembark_date ? fmtDate(r.disembark_date) : '-'}</TableCell>
                  <TableCell className="py-1 px-2 text-xs text-right font-mono">{fmt(r.monthly_accrual)}</TableCell>
                  <TableCell className="py-1 px-2 text-xs text-right font-mono text-amber-700">
                    {r.payout_this_month > 0 ? '0 (지급완료)' : fmt(r.accrued_to_date)}
                  </TableCell>
                  <TableCell className="py-1 px-2 text-xs text-right font-mono text-green-700">{r.payout_this_month > 0 ? fmt(r.payout_this_month) : '-'}</TableCell>
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
    </div>
  );
}
