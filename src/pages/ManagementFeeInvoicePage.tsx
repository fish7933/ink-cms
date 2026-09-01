import { useState, useEffect, useMemo } from 'react';
import { FileSpreadsheet, ChevronDown, ChevronRight, RefreshCw, Trash2 } from 'lucide-react';
import { useTabContext } from '@/contexts/TabContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { getCompanies, getShips } from '@/lib/store';
import type { Ship } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { getBankAccounts } from '@/services/accounting-bank-account.service';
import { managementFeeCalcService, type ManagementFeeLedgerActualCostEntry } from '@/services/management-fee-calc.service';
import {
  managementFeeInvoiceService,
  type ManagementFeeInvoiceData,
  type ManagementFeeInvoiceListRow,
} from '@/services/management-fee-invoice.service';
import OwnerFleetShipCheckTree from '@/components/management-fee/OwnerFleetShipCheckTree';
import type { Company, Fleet } from '@/types/models';
import type { BankAccountWithBalance } from '@/types/accounting';

const currentYearMonth = () => new Date().toISOString().slice(0, 7);

// 선택된 선박 id 집합에서 선주 id들만 뽑아낸다(청구서는 선박이 아니라 선주 단위이므로,
// 일괄 작성 화면에서 트리로 선박/플릿/선주를 고르면 그 소속 선주들의 청구서를 전부 만든다).
function resolveOwnerIds(selectedShipIds: Set<string>, ships: { id: string; owner_id?: string }[]): string[] {
  const ownerIds = new Set<string>();
  for (const ship of ships) {
    if (selectedShipIds.has(ship.id) && ship.owner_id) ownerIds.add(ship.owner_id);
  }
  return [...ownerIds];
}

export default function ManagementFeeInvoicePage() {
  const { toast } = useToast();

  const [owners, setOwners] = useState<Company[]>([]);
  const [ships, setShips] = useState<Ship[]>([]);
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccountWithBalance[]>([]);

  useEffect(() => {
    (async () => {
      const [companies, shipRows, accounts, { data: fleetRows }] = await Promise.all([
        getCompanies(), getShips(), getBankAccounts(), supabase.from('fleets').select('*'),
      ]);
      setOwners(companies.filter(c => c.type === 'owner'));
      setShips(shipRows);
      setBankAccounts(accounts);
      setFleets((fleetRows || []) as Fleet[]);
    })();
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><FileSpreadsheet className="w-5 h-5 text-muted-foreground" />관리비 청구서</h1>
        <p className="text-xs text-muted-foreground mt-1">
          선주 소속 선박들의 관리비 계산 결과 + 실비 항목 기록 + 급여(총급여-OBP)/상병수당/재고용수당을 모아 청구서 엑셀을 생성합니다. 선박별로 관리비 계산이 먼저 되어 있어야 합니다.
        </p>
      </div>

      <Tabs defaultValue="list">
        <TabsList className="h-9">
          <TabsTrigger value="list" className="text-xs">청구서 목록</TabsTrigger>
          <TabsTrigger value="create" className="text-xs">청구서 작성</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-3">
          <InvoiceListTab />
        </TabsContent>

        <TabsContent value="create" className="mt-3">
          <InvoiceCreateTab ships={ships} owners={owners} fleets={fleets} bankAccounts={bankAccounts} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export async function buildActualCostEntriesByShip(invoiceData: ManagementFeeInvoiceData): Promise<Record<string, ManagementFeeLedgerActualCostEntry[]>> {
  const lists = await Promise.all(invoiceData.ships.map(async s => ({
    shipId: s.ship_id,
    entries: s.period_id ? (await managementFeeCalcService.getLedgerForPeriod(s.period_id))?.actual_cost_entries || [] : [] as ManagementFeeLedgerActualCostEntry[],
  })));
  const result: Record<string, ManagementFeeLedgerActualCostEntry[]> = {};
  lists.forEach(({ shipId, entries }) => { result[shipId] = entries; });
  return result;
}

// ── 청구서 작성 ─────────────────────────────────────────────
function InvoiceCreateTab({ ships, owners, fleets, bankAccounts }: { ships: Ship[]; owners: Company[]; fleets: Fleet[]; bankAccounts: BankAccountWithBalance[] }) {
  const { toast } = useToast();
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [selectedShipIds, setSelectedShipIds] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState<{ ownerId: string; ownerName: string; status: 'ok' | 'no_rate' | 'no_calc' | 'error'; message?: string }[] | null>(null);
  const [calculatedShipIds, setCalculatedShipIds] = useState<Set<string> | null>(null);
  // 선주별 외화/원화 계좌 선택 — 선주가 처음 선택되면 그 선주가 예전 청구서에 마지막으로
  // 지정해뒀던 계좌를 자동으로 채워준다(한 번 지정해두면 계속 이어서 쓰임). 아직 한 번도
  // 지정한 적 없으면 빈 채로 두고, 필요할 때만 골라 넣으면 된다.
  const [ownerAccounts, setOwnerAccounts] = useState<Record<string, { usd: string; krw: string }>>({});

  // 청구서는 그 달 관리비 계산이 된 선박에서만 만들 수 있으므로, 선택 목록도 계산 안 된
  // 선박은 아예 빼고 보여준다.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setCalculatedShipIds(null);
      const shipIds = ships.map(s => s.id);
      if (shipIds.length === 0) { if (!cancelled) setCalculatedShipIds(new Set()); return; }
      const { data } = await supabase.from('management_fee_periods').select('ship_id').eq('year_month', yearMonth).in('ship_id', shipIds);
      if (!cancelled) setCalculatedShipIds(new Set((data || []).map(r => String(r.ship_id))));
    })();
    return () => { cancelled = true; };
  }, [ships, yearMonth]);

  const targetOwnerIds = resolveOwnerIds(selectedShipIds, ships);

  // 선택된 선주 중 아직 계좌 상태를 안 채운 선주가 있으면, 그 선주의 마지막 저장 계좌를 불러와 채운다.
  useEffect(() => {
    const missing = targetOwnerIds.filter(id => !(id in ownerAccounts));
    if (missing.length === 0) return;
    (async () => {
      const fetched = await Promise.all(missing.map(async ownerId => {
        const latest = await managementFeeInvoiceService.getLatestBankAccounts(ownerId);
        return [ownerId, { usd: latest.usd_bank_account_id || '', krw: latest.krw_bank_account_id || '' }] as const;
      }));
      setOwnerAccounts(prev => {
        const next = { ...prev };
        for (const [ownerId, acc] of fetched) next[ownerId] = acc;
        return next;
      });
    })();
  }, [targetOwnerIds, ownerAccounts]);

  const setOwnerAccount = (ownerId: string, field: 'usd' | 'krw', value: string) => {
    setOwnerAccounts(prev => ({ ...prev, [ownerId]: { ...(prev[ownerId] || { usd: '', krw: '' }), [field]: value } }));
  };

  // 청구서 작성은 청구서(임시저장 + 문서번호 발급 + 선주별 계좌 지정)까지만 한다 — 엑셀은
  // "청구서 목록"에서 각 청구서를 열어(청구서 확인 화면) 확인한 뒤 필요할 때만 개별적으로 받는다.
  const handleCreate = async () => {
    if (targetOwnerIds.length === 0) { toast({ title: '선주/플릿/선박을 하나 이상 선택하세요.', variant: 'destructive' }); return; }
    setProcessing(true);
    setResults(null);
    const rows: { ownerId: string; ownerName: string; status: 'ok' | 'no_rate' | 'no_calc' | 'error'; message?: string }[] = [];
    try {
      for (const ownerId of targetOwnerIds) {
        const ownerName = owners.find(o => o.id === ownerId)?.name || ownerId;
        try {
          const hasCalc = await managementFeeInvoiceService.hasAnyManagementFeeCalc(ownerId, yearMonth);
          if (!hasCalc) { rows.push({ ownerId, ownerName, status: 'no_calc', message: '이 달 관리비 계산이 하나도 안 됨 — 건너뜀' }); continue; }
          const settings = await managementFeeInvoiceService.getOrCreateDraftInvoice(ownerId, yearMonth);
          if (!settings) { rows.push({ ownerId, ownerName, status: 'error', message: '청구서 생성 실패' }); continue; }
          const acc = ownerAccounts[ownerId];
          if (acc && (acc.usd || acc.krw)) {
            await managementFeeInvoiceService.updateInvoiceSettings(settings.id, {
              usd_bank_account_id: acc.usd || null,
              krw_bank_account_id: acc.krw || null,
            });
          }
          const data = await managementFeeInvoiceService.getInvoiceData(ownerId, yearMonth);
          if (!data) { rows.push({ ownerId, ownerName, status: 'error', message: '데이터 조회 실패' }); continue; }
          if (!data.krw_rate_to_usd) { rows.push({ ownerId, ownerName, status: 'no_rate', message: '임시저장됨 — KRW 환율 미등록으로 청구서 확인 화면에서 엑셀 다운로드는 아직 안 됨' }); continue; }
          rows.push({ ownerId, ownerName, status: 'ok', message: '임시저장됨 — 청구서 목록에서 확인 후 엑셀 다운로드하세요' });
        } catch (e) {
          rows.push({ ownerId, ownerName, status: 'error', message: e instanceof Error ? e.message : String(e) });
        }
      }
      setResults(rows);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">청구서 작성</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-gray-500">
            선주/플릿/선박을 선택하면 선박이 속한 선주들의 청구서를 한 번에 임시저장합니다(문서번호 자동 발급). 엑셀 다운로드는 여기서 바로 하지 않으며, "청구서 목록"에서 각 청구서를 열어 확인한 뒤 필요할 때 개별적으로 받으세요.
          </p>
          <div className="space-y-1.5">
            <Label className="text-xs">청구 월</Label>
            <Input type="month" value={yearMonth} onChange={e => setYearMonth(e.target.value)} className="h-9 text-sm w-40" />
          </div>
          {calculatedShipIds === null ? (
            <div className="text-xs text-gray-400 py-4 text-center">불러오는 중...</div>
          ) : calculatedShipIds.size === 0 ? (
            <div className="text-xs text-gray-400 py-4 text-center border rounded-md">{yearMonth}에 관리비 계산이 된 선박이 없습니다. 관리비 계산 화면에서 먼저 계산하세요.</div>
          ) : (
            <OwnerFleetShipCheckTree
              ships={ships}
              companies={owners}
              fleets={fleets}
              onlyShipIds={calculatedShipIds}
              selectedShipIds={selectedShipIds}
              onChange={setSelectedShipIds}
            />
          )}

          {targetOwnerIds.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs">선주별 계좌 (선택된 선주 {targetOwnerIds.length}곳 — 지정해두면 다음부터 자동으로 이어서 쓰입니다)</Label>
              <div className="rounded-md border divide-y">
                {targetOwnerIds.map(ownerId => {
                  const ownerName = owners.find(o => o.id === ownerId)?.name || ownerId;
                  const acc = ownerAccounts[ownerId] || { usd: '', krw: '' };
                  return (
                    <div key={ownerId} className="flex flex-wrap items-center gap-2 px-3 py-2">
                      <span className="text-xs font-medium w-32 shrink-0 truncate" title={ownerName}>{ownerName}</span>
                      <Select value={acc.usd || 'none'} onValueChange={v => setOwnerAccount(ownerId, 'usd', v === 'none' ? '' : v)}>
                        <SelectTrigger className="h-7 text-xs w-48"><SelectValue placeholder="외화계좌" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none" className="text-xs text-gray-400">외화계좌 선택 안 함</SelectItem>
                          {bankAccounts.map(a => <SelectItem key={a.id} value={a.id} className="text-xs">{a.bank_name} {a.account_name} ({a.currency})</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Select value={acc.krw || 'none'} onValueChange={v => setOwnerAccount(ownerId, 'krw', v === 'none' ? '' : v)}>
                        <SelectTrigger className="h-7 text-xs w-48"><SelectValue placeholder="원화계좌" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none" className="text-xs text-gray-400">원화계좌 선택 안 함</SelectItem>
                          {bankAccounts.map(a => <SelectItem key={a.id} value={a.id} className="text-xs">{a.bank_name} {a.account_name} ({a.currency})</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button size="sm" className="gap-1.5" onClick={handleCreate} disabled={processing || targetOwnerIds.length === 0}>
              <FileSpreadsheet className="h-4 w-4" />{processing ? '처리 중...' : `청구서 작성 (${targetOwnerIds.length}개 선주)`}
            </Button>
          </div>
        </CardContent>
      </Card>

      {results && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">처리 결과</CardTitle></CardHeader>
          <CardContent>
            <ul className="text-xs space-y-1">
              {results.map(r => (
                <li key={r.ownerId} className="flex items-center gap-2">
                  <Badge variant={r.status === 'ok' ? 'default' : r.status === 'no_rate' || r.status === 'no_calc' ? 'secondary' : 'destructive'} className="text-[10px]">
                    {r.status === 'ok' ? '임시저장' : r.status === 'no_rate' ? '환율 없음' : r.status === 'no_calc' ? '계산 없음' : '실패'}
                  </Badge>
                  <span className="font-medium">{r.ownerName}</span>
                  {r.message && <span className="text-gray-400">— {r.message}</span>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── 청구서 목록 ─────────────────────────────────────────────
// 년/월 단위로 묶어서 보여준다 — 월을 클릭하면 그 달에 작성된 청구서들이 펼쳐진다.
// 나중에 자금일보처럼 결재 단계(임시저장 → 결재중 → 확정)를 태울 것을 염두에 두고,
// "그 달의 청구서 묶음"을 다루는 단위 자체를 화면 구조의 기본으로 삼는다.
function InvoiceListTab() {
  const { openNewTab } = useTabContext();
  const { toast } = useToast();
  const [rows, setRows] = useState<ManagementFeeInvoiceListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set());
  const [bulkRewriting, setBulkRewriting] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const loadRows = async () => {
    setLoading(true);
    try {
      const data = await managementFeeInvoiceService.listInvoices();
      setRows(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadRows(); }, []);

  const toggleInvoiceSelected = (id: string) => {
    setSelectedInvoiceIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleMonthSelected = (monthRows: ManagementFeeInvoiceListRow[], checked: boolean) => {
    setSelectedInvoiceIds(prev => {
      const next = new Set(prev);
      monthRows.forEach(r => checked ? next.add(r.id) : next.delete(r.id));
      return next;
    });
  };

  // 청구서 재작성 — 발행됨 상태를 임시저장으로 되돌린다. 실제 금액은 매번 새로 계산해서
  // 보여주므로(관리비 일괄 재계산 등으로 바뀐 수치도 자동 반영), 상태만 되돌리면 된다.
  const handleBulkRewrite = async () => {
    if (selectedInvoiceIds.size === 0) return;
    if (!confirm(`선택한 ${selectedInvoiceIds.size}건의 청구서를 재작성(임시저장으로 되돌리기) 하시겠습니까?`)) return;
    setBulkRewriting(true);
    let succeeded = 0;
    const failed: string[] = [];
    try {
      for (const id of selectedInvoiceIds) {
        try {
          await managementFeeInvoiceService.resetToDraft(id);
          succeeded++;
        } catch {
          failed.push(rows.find(r => r.id === id)?.doc_number || id);
        }
      }
      toast({
        title: `일괄 재작성 완료 — 성공 ${succeeded} / 실패 ${failed.length}`,
        description: failed.length > 0 ? `실패: ${failed.join(', ')}` : undefined,
        variant: failed.length > 0 ? 'destructive' : undefined,
      });
      setSelectedInvoiceIds(new Set());
      await loadRows();
    } finally {
      setBulkRewriting(false);
    }
  };

  const handleBulkDeleteInvoices = async () => {
    if (selectedInvoiceIds.size === 0) return;
    if (!confirm(`선택한 ${selectedInvoiceIds.size}건의 청구서를 삭제하시겠습니까? 되돌릴 수 없습니다.`)) return;
    setBulkDeleting(true);
    let succeeded = 0;
    const failed: string[] = [];
    try {
      for (const id of selectedInvoiceIds) {
        try {
          await managementFeeInvoiceService.deleteInvoice(id);
          succeeded++;
        } catch {
          failed.push(rows.find(r => r.id === id)?.doc_number || id);
        }
      }
      toast({
        title: `일괄 삭제 완료 — 성공 ${succeeded} / 실패 ${failed.length}`,
        description: failed.length > 0 ? `실패: ${failed.join(', ')}` : undefined,
        variant: failed.length > 0 ? 'destructive' : undefined,
      });
      setSelectedInvoiceIds(new Set());
      await loadRows();
    } finally {
      setBulkDeleting(false);
    }
  };

  const monthGroups = useMemo(() => {
    const byMonth = new Map<string, ManagementFeeInvoiceListRow[]>();
    for (const r of rows) {
      const arr = byMonth.get(r.year_month) || [];
      arr.push(r);
      byMonth.set(r.year_month, arr);
    }
    return [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [rows]);

  const toggleMonth = (ym: string) => {
    setExpandedMonths(prev => {
      const next = new Set(prev);
      if (next.has(ym)) next.delete(ym); else next.add(ym);
      return next;
    });
  };

  const goToInvoiceView = (r: ManagementFeeInvoiceListRow) => {
    openNewTab(`/management-fee-invoice/${r.owner_id}/${r.year_month}`, `청구서: ${r.owner_name} ${r.year_month}`, true);
  };

  if (loading) return <div className="text-center py-8 text-sm text-gray-400">불러오는 중...</div>;

  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        {selectedInvoiceIds.size > 0 && (
          <div className="flex items-center justify-between gap-2 flex-wrap bg-blue-50 border border-blue-200 rounded-md px-4 py-2">
            <span className="text-xs font-medium text-blue-800">{selectedInvoiceIds.size}건 선택됨</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={handleBulkRewrite} disabled={bulkRewriting || bulkDeleting}>
                <RefreshCw className="w-3.5 h-3.5" />{bulkRewriting ? '재작성 중...' : `일괄 재작성 (${selectedInvoiceIds.size})`}
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-red-600 border-red-300 hover:bg-red-50" onClick={handleBulkDeleteInvoices} disabled={bulkRewriting || bulkDeleting}>
                <Trash2 className="w-3.5 h-3.5" />{bulkDeleting ? '삭제 중...' : `일괄 삭제 (${selectedInvoiceIds.size})`}
              </Button>
            </div>
          </div>
        )}
        {monthGroups.length === 0 ? (
          <div className="text-center py-8 text-sm text-gray-400">작성된 청구서가 없습니다.</div>
        ) : (
          <div className="space-y-2">
            {monthGroups.map(([ym, monthRows]) => {
              const issuedCount = monthRows.filter(r => r.status === 'issued').length;
              const expanded = expandedMonths.has(ym);
              const allMonthSelected = monthRows.every(r => selectedInvoiceIds.has(r.id));
              return (
                <div key={ym} className="border rounded-md overflow-hidden">
                  <div className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={allMonthSelected}
                        onCheckedChange={checked => toggleMonthSelected(monthRows, !!checked)}
                        onClick={e => e.stopPropagation()}
                      />
                      <button type="button" onClick={() => toggleMonth(ym)} className="flex items-center gap-2 text-left">
                        {expanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                        <span className="text-sm font-semibold">{ym}</span>
                        <span className="text-xs text-gray-400">청구서 {monthRows.length}건</span>
                      </button>
                    </div>
                    <button type="button" onClick={() => toggleMonth(ym)}>
                      <Badge variant="secondary" className="text-[10px]">발행 {issuedCount}/{monthRows.length}</Badge>
                    </button>
                  </div>
                  {expanded && (
                    <div className="border-t overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs w-8"></TableHead>
                            <TableHead className="text-xs">문서번호</TableHead>
                            <TableHead className="text-xs">선주</TableHead>
                            <TableHead className="text-xs">상태</TableHead>
                            <TableHead className="text-xs">발행일</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {monthRows.map(r => (
                            <TableRow
                              key={r.id}
                              className="cursor-pointer hover:bg-gray-50"
                              onClick={() => goToInvoiceView(r)}
                              title="클릭하면 이 청구서를 확인할 수 있습니다."
                            >
                              <TableCell onClick={e => e.stopPropagation()}>
                                <Checkbox checked={selectedInvoiceIds.has(r.id)} onCheckedChange={() => toggleInvoiceSelected(r.id)} />
                              </TableCell>
                              <TableCell className="text-xs font-mono">{r.doc_number}</TableCell>
                              <TableCell className="text-xs font-medium">{r.owner_name}</TableCell>
                              <TableCell><Badge variant={r.status === 'issued' ? 'default' : 'secondary'} className="text-xs">{r.status === 'issued' ? '발행됨' : '임시저장'}</Badge></TableCell>
                              <TableCell className="text-xs text-gray-500">{r.issued_at ? new Date(r.issued_at).toLocaleString('ko-KR') : '-'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <p className="text-xs text-gray-400">청구서 행을 클릭하면 청구서 확인 화면으로 이동합니다. 이어서 작성하려면 "단일 작성" 탭에서 같은 선주/월을 다시 선택하세요. 일괄 재작성은 발행됨 상태를 임시저장으로 되돌려 최신 관리비 계산 결과를 다시 반영할 수 있게 합니다.</p>
      </CardContent>
    </Card>
  );
}
