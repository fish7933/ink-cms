import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { BadgeDollarSign, Trash2, ExternalLink } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { useToast } from '@/hooks/use-toast';
import { getCurrentUser, getShips } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { supervisorService } from '@/services/supervisor.service';
import { allowanceService } from '@/services/allowance.service';
import type { Ship } from '@/lib/store';
import type { CrewContractAllowanceWithFullDetails, AllowanceKind, AllowancePaymentBasis, AllowancePaymentMethod } from '@/types/allowance';

const fmt = (n: number) => n.toLocaleString('ko-KR');
const KIND_LABELS: Record<AllowanceKind, string> = { allowance: '수당', deduction: '공제' };
const KIND_COLORS: Record<AllowanceKind, string> = {
  allowance: 'bg-blue-50 text-blue-700 border-blue-200',
  deduction: 'bg-amber-50 text-amber-700 border-amber-200',
};
const BASIS_LABELS: Record<AllowancePaymentBasis, string> = { monthly: '매월 지급', on_embark_once: '승선월 1회', disembark_settlement: '하선 시 정산' };
const METHOD_LABELS: Record<AllowancePaymentMethod, string> = { ship_direct: '본선 직접지급', owner_billed: '선주 청구' };
const CONTRACT_STATUS_LABELS: Record<string, string> = { active: '진행중', completed: '종료', terminated: '해지', draft: '초안', pending_approval: '결재중', approved: '승인', rejected: '반려' };
const PAGE_SIZE = 20;

// 계약별(선원별)로 흩어져 있는 crew_contract_allowances(재고용수당 등 실제 적용된 수당/공제)를
// 상병 수당 관리 화면과 동일한 패턴으로 한눈에 모아 보는 전용 화면. 금액/조건 수정은 이미
// ContractManagementPage.tsx에 완전한 편집 UI가 있으므로 여기서는 별도 수정 폼을 만들지 않고
// 행 클릭 시 그 계약 편집 화면으로 이동하는 링크만 제공한다.
export default function CrewAllowanceManagementPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [ships, setShips] = useState<Ship[]>([]);
  const [owners, setOwners] = useState<Map<string, string>>(new Map());
  const [fleets, setFleets] = useState<Map<string, string>>(new Map());
  const [records, setRecords] = useState<CrewContractAllowanceWithFullDetails[]>([]);
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState<'active' | 'all'>('active');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [fleetFilter, setFleetFilter] = useState('');
  const [shipFilter, setShipFilter] = useState('');

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

  const loadRecords = useCallback(async (status: 'active' | 'all', shipList: Ship[]) => {
    if (shipList.length === 0) { setRecords([]); setLoading(false); return; }
    setLoading(true);
    try {
      const data = await allowanceService.getAllContractAllowances(status === 'all' ? undefined : { activeOnly: true });
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
    if (!confirm(`선택한 수당/공제 항목 ${selectedIds.length}건을 삭제하시겠습니까? 되돌릴 수 없습니다.`)) return;
    setDeleting(true);
    try {
      await Promise.all(selectedIds.map(id => allowanceService.deleteContractAllowance(id)));
      toast({ title: `${selectedIds.length}건을 삭제했습니다.` });
      setSelectedIds([]);
      await loadRecords(statusFilter, ships);
    } catch (e) {
      toast({ title: '삭제 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteOne = async (r: CrewContractAllowanceWithFullDetails) => {
    if (!confirm(`${r.crew_name}의 "${r.allowance_item_name}" 항목을 삭제하시겠습니까?`)) return;
    try {
      await allowanceService.deleteContractAllowance(r.id);
      await loadRecords(statusFilter, ships);
    } catch (e) {
      toast({ title: '삭제 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><BadgeDollarSign className="w-5 h-5 text-muted-foreground" />수당 관리</h1>
        <p className="text-xs text-muted-foreground mt-1">
          재고용수당 등 각 계약에 실제 적용된 수당/공제 항목을 모아 봅니다. 금액·조건 수정은 계약 편집 화면(발령 연결)으로 이동해 진행하세요.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">계약상태</Label>
          <Select value={statusFilter} onValueChange={v => setStatusFilter(v as 'active' | 'all')}>
            <SelectTrigger className="h-7 text-xs w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">진행중</SelectItem>
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
        <div className="text-center py-12 text-sm text-gray-400">해당 조건의 수당/공제 항목이 없습니다.</div>
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
                <TableHead className="py-1 px-2 text-xs whitespace-nowrap">항목명</TableHead>
                <TableHead className="py-1 px-2 text-xs whitespace-nowrap">종류</TableHead>
                <TableHead className="py-1 px-2 text-xs text-right whitespace-nowrap">금액</TableHead>
                <TableHead className="py-1 px-2 text-xs whitespace-nowrap">지급방식</TableHead>
                <TableHead className="py-1 px-2 text-xs whitespace-nowrap">지급주체</TableHead>
                <TableHead className="py-1 px-2 text-xs whitespace-nowrap">계약상태</TableHead>
                <TableHead className="py-1 px-2 text-xs whitespace-nowrap">비고</TableHead>
                <TableHead className="py-1 px-2 text-xs text-center whitespace-nowrap">관리</TableHead>
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
                  <TableCell className="py-1 px-2 text-xs text-muted-foreground max-w-[90px] truncate" title={r.ship_name}>{r.ship_name || '-'}</TableCell>
                  <TableCell className="py-1 px-2 text-xs text-muted-foreground">{r.rank_code}</TableCell>
                  <TableCell className="py-1 px-2 text-xs font-medium">{r.crew_name}</TableCell>
                  <TableCell className="py-1 px-2 text-xs">{r.allowance_item_name}</TableCell>
                  <TableCell className="py-1 px-2"><Badge variant="outline" className={`text-[11px] ${KIND_COLORS[r.kind]}`}>{KIND_LABELS[r.kind]}</Badge></TableCell>
                  <TableCell className="py-1 px-2 text-xs text-right font-mono">{fmt(r.amount)} {r.currency}</TableCell>
                  <TableCell className="py-1 px-2 text-xs text-muted-foreground whitespace-nowrap">{BASIS_LABELS[r.payment_basis]}</TableCell>
                  <TableCell className="py-1 px-2 text-xs text-muted-foreground whitespace-nowrap">{METHOD_LABELS[r.payment_method]}</TableCell>
                  <TableCell className="py-1 px-2 text-xs text-muted-foreground whitespace-nowrap">{CONTRACT_STATUS_LABELS[r.contract_status] || r.contract_status || '-'}</TableCell>
                  <TableCell className="py-1 px-2 text-xs text-muted-foreground max-w-[140px] truncate" title={r.notes}>{r.notes || '-'}</TableCell>
                  <TableCell className="py-1 px-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        size="sm" variant="ghost" className="h-6 w-6 p-0" title="계약 편집 화면으로 이동"
                        onClick={() => navigate(`/contract-management?contractId=${r.contract_id}`)}
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="삭제" onClick={() => handleDeleteOne(r)}>
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </Button>
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
    </div>
  );
}
