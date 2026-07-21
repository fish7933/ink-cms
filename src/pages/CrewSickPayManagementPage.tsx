import { useState, useEffect, useCallback, useMemo } from 'react';
import { Stethoscope, History, Trash2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { useToast } from '@/hooks/use-toast';
import { getCurrentUser, getShips } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { supervisorService } from '@/services/supervisor.service';
import { sickPayService } from '@/services/sick-pay.service';
import type { Ship } from '@/lib/store';
import type { CrewSickPayRecordWithDetails } from '@/types/sick-pay';

const fmt = (n: number) => n.toLocaleString('ko-KR');
const STATUS_LABELS: Record<string, string> = { active: '진행중', closed: '종결' };
const STATUS_COLORS: Record<string, string> = {
  active: 'bg-red-50 text-red-700 border-red-200',
  closed: 'bg-gray-50 text-gray-500 border-gray-200',
};
const PAGE_SIZE = 20;

// 상병(질병/부상) 하선 선원의 상병급여만 따로 모아 볼 수 있는 전용 화면 — 선원 급여대장에는
// 들어가지 않는 항목이라 여기서 전체 케이스(진행중/종결)와 월별 청구 내역을 관리한다.
export default function CrewSickPayManagementPage() {
  const { toast } = useToast();
  const [ships, setShips] = useState<Ship[]>([]);
  const [owners, setOwners] = useState<Map<string, string>>(new Map());
  const [fleets, setFleets] = useState<Map<string, string>>(new Map());
  const [records, setRecords] = useState<CrewSickPayRecordWithDetails[]>([]);
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState<'active' | 'closed' | 'all'>('active');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [fleetFilter, setFleetFilter] = useState('');
  const [shipFilter, setShipFilter] = useState('');

  const [historyRecord, setHistoryRecord] = useState<CrewSickPayRecordWithDetails | null>(null);
  const [historyEntries, setHistoryEntries] = useState<{ year_month: string; amount: number; confirmed: boolean }[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [closingRecord, setClosingRecord] = useState<CrewSickPayRecordWithDetails | null>(null);
  const [closeDate, setCloseDate] = useState('');
  const [closing, setClosing] = useState(false);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
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

  const loadRecords = useCallback(async (status: 'active' | 'closed' | 'all', shipList: Ship[]) => {
    if (shipList.length === 0) { setRecords([]); setLoading(false); return; }
    setLoading(true);
    try {
      const data = await sickPayService.getAllSickPayRecords(status === 'all' ? undefined : status);
      const shipIds = new Set(shipList.map(s => s.id));
      setRecords(data.filter(r => shipIds.has(r.ship_id)));
    } catch (e) {
      toast({ title: '조회 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadRecords(statusFilter, ships); }, [statusFilter, ships, loadRecords]);

  const handleOwnerFilterChange = (id: string) => { setOwnerFilter(id); setFleetFilter(''); setShipFilter(''); };
  const handleFleetFilterChange = (id: string) => { setFleetFilter(id); setShipFilter(''); };

  const fleetList = useMemo(() => [...fleets.entries()].map(([id, name]) => ({ id, name })), [fleets]);
  const fleetsForOwnerFilter = ownerFilter ? fleetList.filter(f => ships.some(s => s.owner_id === ownerFilter && s.fleet_id === f.id)) : fleetList;
  const shipsForFilter = ships.filter(s => (!ownerFilter || s.owner_id === ownerFilter) && (!fleetFilter || s.fleet_id === fleetFilter));

  const filteredRecords = useMemo(() => records.filter(r =>
    (!ownerFilter || r.owner_id === ownerFilter) &&
    (!fleetFilter || r.fleet_id === fleetFilter) &&
    (!shipFilter || r.ship_id === shipFilter)
  ), [records, ownerFilter, fleetFilter, shipFilter]);

  useEffect(() => { setPage(1); setSelectedIds([]); }, [statusFilter, ownerFilter, fleetFilter, shipFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / PAGE_SIZE));
  const pagedRecords = filteredRecords.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pagedIds = pagedRecords.map(r => r.id);

  const toggleSelect = (id: string) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleSelectAll = (checked: boolean) => setSelectedIds(checked ? pagedIds : []);

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`선택한 상병급여 케이스 ${selectedIds.length}건을 삭제하시겠습니까? 월별 청구 내역도 함께 삭제되며 되돌릴 수 없습니다.`)) return;
    setDeleting(true);
    try {
      await sickPayService.deleteSickPayRecords(selectedIds);
      toast({ title: `${selectedIds.length}건을 삭제했습니다.` });
      setSelectedIds([]);
      await loadRecords(statusFilter, ships);
    } catch (e) {
      toast({ title: '삭제 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  const openHistory = async (record: CrewSickPayRecordWithDetails) => {
    setHistoryRecord(record);
    setHistoryLoading(true);
    try {
      setHistoryEntries(await sickPayService.getMonthlyEntriesForRecord(record));
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleReopen = async (record: CrewSickPayRecordWithDetails) => {
    if (!confirm(`${record.crew_name}의 상병급여 케이스를 다시 진행중 상태로 되돌리시겠습니까?`)) return;
    try {
      await sickPayService.reopenSickPayRecord(record.id);
      await loadRecords(statusFilter, ships);
    } catch (e) {
      toast({ title: '재개 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    }
  };

  const openCloseDialog = (record: CrewSickPayRecordWithDetails) => {
    setClosingRecord(record);
    setCloseDate(new Date().toISOString().slice(0, 10));
  };

  const handleConfirmClose = async () => {
    if (!closingRecord) return;
    setClosing(true);
    try {
      await sickPayService.closeSickPayRecord(closingRecord.id, closeDate);
      toast({ title: '종결되었습니다', description: '다음 달부터는 급여대장에 나타나지 않습니다.' });
      setClosingRecord(null);
      await loadRecords(statusFilter, ships);
    } catch (e) {
      toast({ title: '종결 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setClosing(false);
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><Stethoscope className="w-5 h-5 text-muted-foreground" />상병 수당 관리</h1>
        <p className="text-xs text-muted-foreground mt-1">
          상병(질병/부상) 하선 선원에게 귀국일 다음날부터 발생하는 상병급여 케이스를 모아 봅니다(귀국일까지는 정상 급여가 지급됩니다). 선원 급여대장과 별개로 관리되며, 매월 청구액은 각 선박의 급여대장 화면 하단에서 수정할 수 있습니다.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">상태</Label>
          <Select value={statusFilter} onValueChange={v => setStatusFilter(v as 'active' | 'closed' | 'all')}>
            <SelectTrigger className="h-7 text-xs w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">진행중</SelectItem>
              <SelectItem value="closed">종결</SelectItem>
              <SelectItem value="all">전체</SelectItem>
            </SelectContent>
          </Select>
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
      </div>

      {selectedIds.length > 0 && (
        <div className="flex items-center justify-between gap-2 bg-red-50 border border-red-200 rounded-md px-4 py-2">
          <span className="text-xs font-medium text-red-800">{selectedIds.length}건 선택됨</span>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1 bg-white text-red-600 border-red-300" onClick={handleBulkDelete} disabled={deleting}>
            <Trash2 className="w-3.5 h-3.5" />{deleting ? '삭제 중...' : '선택 삭제'}
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
      ) : filteredRecords.length === 0 ? (
        <div className="text-center py-12 text-sm text-gray-400">해당 조건의 상병급여 케이스가 없습니다.</div>
      ) : (
        <div className="rounded-md border overflow-hidden overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="py-1 px-2 w-8">
                  <Checkbox
                    checked={pagedIds.length > 0 && pagedIds.every(id => selectedIds.includes(id))}
                    onCheckedChange={checked => toggleSelectAll(!!checked)}
                  />
                </TableHead>
                <TableHead className="py-1 px-2 text-xs whitespace-nowrap max-w-[70px]">선주</TableHead>
                <TableHead className="py-1 px-2 text-xs whitespace-nowrap max-w-[70px]">플릿</TableHead>
                <TableHead className="py-1 px-2 text-xs whitespace-nowrap max-w-[90px]">선박</TableHead>
                <TableHead className="py-1 px-2 text-xs whitespace-nowrap">직급</TableHead>
                <TableHead className="py-1 px-2 text-xs whitespace-nowrap">선원</TableHead>
                <TableHead className="py-1 px-2 text-xs whitespace-nowrap">귀국일</TableHead>
                <TableHead className="py-1 px-2 text-xs whitespace-nowrap">상병급여 시작일</TableHead>
                <TableHead className="py-1 px-2 text-xs whitespace-nowrap">상태</TableHead>
                <TableHead className="py-1 px-2 text-xs whitespace-nowrap">종결일</TableHead>
                <TableHead className="py-1 px-2 text-xs text-right whitespace-nowrap">기준 월액</TableHead>
                <TableHead className="py-1 px-2 text-xs text-center whitespace-nowrap">내역</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedRecords.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="py-1 px-2">
                    <Checkbox checked={selectedIds.includes(r.id)} onCheckedChange={() => toggleSelect(r.id)} />
                  </TableCell>
                  <TableCell className="py-1 px-2 text-xs text-muted-foreground max-w-[70px] truncate" title={r.owner_name}>{r.owner_name || '-'}</TableCell>
                  <TableCell className="py-1 px-2 text-xs text-muted-foreground max-w-[70px] truncate" title={r.fleet_name}>{r.fleet_name || '-'}</TableCell>
                  <TableCell className="py-1 px-2 text-xs text-muted-foreground max-w-[90px] truncate" title={r.ship_name}>{r.ship_name}</TableCell>
                  <TableCell className="py-1 px-2 text-xs text-muted-foreground">{r.rank_code}</TableCell>
                  <TableCell className="py-1 px-2 text-xs font-medium">{r.crew_name}</TableCell>
                  <TableCell className="py-1 px-2 text-xs text-muted-foreground">{r.return_date || '-'}</TableCell>
                  <TableCell className="py-1 px-2 text-xs text-muted-foreground">{r.start_date}</TableCell>
                  <TableCell className="py-1 px-2"><Badge variant="outline" className={`text-[11px] ${STATUS_COLORS[r.status]}`}>{STATUS_LABELS[r.status]}</Badge></TableCell>
                  <TableCell className="py-1 px-2 text-xs text-muted-foreground">{r.closed_date || '-'}</TableCell>
                  <TableCell className="py-1 px-2 text-xs text-right font-mono">{fmt(r.monthly_amount)}</TableCell>
                  <TableCell className="py-1 px-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="월별 청구 내역" onClick={() => openHistory(r)}>
                        <History className="w-3.5 h-3.5 text-muted-foreground" />
                      </Button>
                      {r.status === 'active' && (
                        <Button size="sm" variant="outline" className="h-6 text-[11px] text-red-600 border-red-300" onClick={() => openCloseDialog(r)}>종결</Button>
                      )}
                      {r.status === 'closed' && (
                        <Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={() => handleReopen(r)}>재개</Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {!loading && filteredRecords.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            총 {filteredRecords.length}건 중 {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, filteredRecords.length)}건 표시
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

      <Dialog open={!!historyRecord} onOpenChange={o => !o && setHistoryRecord(null)}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-1.5"><History className="w-4 h-4 text-muted-foreground" />{historyRecord?.crew_name} — 상병급여 월별 청구 내역</DialogTitle>
          </DialogHeader>
          {historyLoading ? (
            <div className="flex items-center justify-center py-10"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" /></div>
          ) : historyEntries.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">아직 청구된 월이 없습니다.</p>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left p-2 font-medium text-gray-600">월</th>
                    <th className="text-center p-2 font-medium text-gray-600">상태</th>
                    <th className="text-right p-2 font-medium text-gray-600">청구액</th>
                  </tr>
                </thead>
                <tbody>
                  {historyEntries.map(e => (
                    <tr key={e.year_month} className={`border-b ${e.confirmed ? '' : 'text-gray-400'}`}>
                      <td className="py-1 px-2">{e.year_month}</td>
                      <td className="py-1 px-2 text-center">
                        {e.confirmed
                          ? <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200">확정</Badge>
                          : <Badge variant="outline" className="text-[10px] bg-gray-50 text-gray-400 border-gray-200">미확정(계산값)</Badge>}
                      </td>
                      <td className="py-1 px-2 text-right font-mono">{fmt(e.amount)}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-semibold">
                    <td className="py-1 px-2" colSpan={2}>합계 ({historyEntries.length}개월)</td>
                    <td className="py-1 px-2 text-right font-mono">{fmt(historyEntries.reduce((s, e) => s + e.amount, 0))}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!closingRecord} onOpenChange={o => !o && setClosingRecord(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">{closingRecord?.crew_name} — 상병급여 종결</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs">종결일</Label>
            <Input type="date" value={closeDate} onChange={e => setCloseDate(e.target.value)} className="h-8 text-xs" />
            <p className="text-xs text-muted-foreground">종결일 다음 달부터는 급여대장 상병급여 섹션에 더 이상 나타나지 않습니다.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setClosingRecord(null)} disabled={closing}>취소</Button>
            <Button size="sm" className="bg-red-600 hover:bg-red-700" onClick={handleConfirmClose} disabled={closing || !closeDate}>
              {closing ? '종결 중...' : '종결'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
