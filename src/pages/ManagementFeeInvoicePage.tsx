import { useState, useEffect } from 'react';
import { FileSpreadsheet, AlertTriangle, Landmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { getCompanies, getShips } from '@/lib/store';
import type { Ship } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { getCompanyInfo } from '@/services/company-info.service';
import { getBankAccounts } from '@/services/accounting-bank-account.service';
import { managementFeeCalcService, type ManagementFeeLedgerActualCostEntry } from '@/services/management-fee-calc.service';
import {
  managementFeeInvoiceService,
  type ManagementFeeInvoiceData,
  type ManagementFeeInvoiceSettings,
  type ManagementFeeInvoiceListRow,
} from '@/services/management-fee-invoice.service';
import { exportManagementFeeInvoiceToExcel } from '@/utils/management-fee-invoice-export';
import OwnerFleetShipCheckTree from '@/components/management-fee/OwnerFleetShipCheckTree';
import type { Company, Fleet } from '@/types/models';
import type { BankAccountWithBalance } from '@/types/accounting';

const currentYearMonth = () => new Date().toISOString().slice(0, 7);
const fmt = (n: number) => n.toLocaleString('en-US');

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

      <Tabs defaultValue="single">
        <TabsList className="h-9">
          <TabsTrigger value="single" className="text-xs">단일 작성</TabsTrigger>
          <TabsTrigger value="bulk" className="text-xs">일괄 작성</TabsTrigger>
          <TabsTrigger value="list" className="text-xs">청구서 목록</TabsTrigger>
        </TabsList>

        <TabsContent value="single" className="mt-3">
          <SingleInvoiceTab owners={owners} bankAccounts={bankAccounts} />
        </TabsContent>

        <TabsContent value="bulk" className="mt-3">
          <BulkInvoiceTab ships={ships} owners={owners} fleets={fleets} bankAccounts={bankAccounts} />
        </TabsContent>

        <TabsContent value="list" className="mt-3">
          <InvoiceListTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

async function buildActualCostEntriesByShip(invoiceData: ManagementFeeInvoiceData): Promise<Record<string, ManagementFeeLedgerActualCostEntry[]>> {
  const lists = await Promise.all(invoiceData.ships.map(async s => ({
    shipId: s.ship_id,
    entries: s.period_id ? (await managementFeeCalcService.getLedgerForPeriod(s.period_id))?.actual_cost_entries || [] : [] as ManagementFeeLedgerActualCostEntry[],
  })));
  const result: Record<string, ManagementFeeLedgerActualCostEntry[]> = {};
  lists.forEach(({ shipId, entries }) => { result[shipId] = entries; });
  return result;
}

// ── 단일 작성 ─────────────────────────────────────────────
function SingleInvoiceTab({ owners, bankAccounts }: { owners: Company[]; bankAccounts: BankAccountWithBalance[] }) {
  const { toast } = useToast();
  const [ownerId, setOwnerId] = useState('');
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [settings, setSettings] = useState<ManagementFeeInvoiceSettings | null>(null);
  const [usdBankAccountId, setUsdBankAccountId] = useState('');
  const [krwBankAccountId, setKrwBankAccountId] = useState('');

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [invoiceData, setInvoiceData] = useState<ManagementFeeInvoiceData | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!ownerId) { setSettings(null); setUsdBankAccountId(''); setKrwBankAccountId(''); setInvoiceData(null); return; }
    (async () => {
      const s = await managementFeeInvoiceService.getOrCreateDraftInvoice(ownerId, yearMonth);
      setSettings(s);
      setUsdBankAccountId(s?.usd_bank_account_id || '');
      setKrwBankAccountId(s?.krw_bank_account_id || '');
      setInvoiceData(null);
    })();
  }, [ownerId, yearMonth]);

  const handleSaveDraft = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const updated = await managementFeeInvoiceService.updateInvoiceSettings(settings.id, {
        usd_bank_account_id: usdBankAccountId || null,
        krw_bank_account_id: krwBankAccountId || null,
      });
      if (updated) { setSettings(updated); toast({ title: '임시저장 완료' }); }
      else toast({ title: '저장 실패', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    if (!ownerId) { toast({ title: '선주를 선택하세요.', variant: 'destructive' }); return; }
    setLoading(true);
    try {
      const data = await managementFeeInvoiceService.getInvoiceData(ownerId, yearMonth);
      if (!data) { toast({ title: '데이터를 불러오지 못했습니다.', variant: 'destructive' }); return; }
      setInvoiceData(data);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!invoiceData || !settings) return;
    if (!invoiceData.krw_rate_to_usd) { toast({ title: '환율 관리에서 이 달의 KRW 환율을 먼저 입력하세요.', variant: 'destructive' }); return; }
    setExporting(true);
    try {
      const [companyInfo, actualCostEntriesByShip] = await Promise.all([
        getCompanyInfo(),
        buildActualCostEntriesByShip(invoiceData),
      ]);
      const usdAccount = bankAccounts.find(a => a.id === usdBankAccountId) || null;
      const krwAccount = bankAccounts.find(a => a.id === krwBankAccountId) || null;

      await exportManagementFeeInvoiceToExcel({
        data: invoiceData,
        docNumber: settings.doc_number,
        exchangeRate: invoiceData.krw_rate_to_usd,
        usdBankAccount: usdAccount,
        krwBankAccount: krwAccount,
        companyInfo: companyInfo || { name: '' },
        actualCostEntriesByShip,
      });
      await managementFeeInvoiceService.markIssued(settings.id, invoiceData.krw_rate_to_usd);
      toast({ title: '엑셀 다운로드 완료' });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">청구서 설정</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">선주</Label>
              <Select value={ownerId} onValueChange={setOwnerId}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="선주 선택" /></SelectTrigger>
                <SelectContent>
                  {owners.map(o => <SelectItem key={o.id} value={o.id} className="text-sm">{o.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">청구 월</Label>
              <Input type="month" value={yearMonth} onChange={e => setYearMonth(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">문서번호</Label>
              <div className="h-9 flex items-center text-sm font-medium text-gray-700">{settings?.doc_number || '- (선주/월 선택 시 자동 발급)'}</div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">상태</Label>
              <div className="h-9 flex items-center">
                {settings && <Badge variant={settings.status === 'issued' ? 'default' : 'secondary'} className="text-xs">{settings.status === 'issued' ? '발행됨' : '임시저장'}</Badge>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">외화계좌</Label>
              <Select value={usdBankAccountId || 'none'} onValueChange={v => setUsdBankAccountId(v === 'none' ? '' : v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="계좌 선택" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-sm text-gray-400">선택 안 함</SelectItem>
                  {bankAccounts.map(a => <SelectItem key={a.id} value={a.id} className="text-sm">{a.bank_name} {a.account_name} ({a.currency})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">원화계좌</Label>
              <Select value={krwBankAccountId || 'none'} onValueChange={v => setKrwBankAccountId(v === 'none' ? '' : v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="계좌 선택" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-sm text-gray-400">선택 안 함</SelectItem>
                  {bankAccounts.map(a => <SelectItem key={a.id} value={a.id} className="text-sm">{a.bank_name} {a.account_name} ({a.currency})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={handleSaveDraft} disabled={saving || !settings}>{saving ? '저장 중...' : '임시저장'}</Button>
            <Button size="sm" onClick={handlePreview} disabled={loading || !ownerId}>{loading ? '불러오는 중...' : '미리보기'}</Button>
          </div>
        </CardContent>
      </Card>

      {invoiceData && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{invoiceData.owner_name} — {invoiceData.year_month}</CardTitle>
              <Button size="sm" className="gap-1.5" onClick={handleExport} disabled={exporting || !invoiceData.krw_rate_to_usd}>
                <FileSpreadsheet className="h-4 w-4" />{exporting ? '생성 중...' : '엑셀 다운로드'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {!invoiceData.krw_rate_to_usd && (
              <Alert variant="destructive">
                <Landmark className="h-4 w-4" />
                <AlertDescription className="text-xs">이 달의 KRW 환율이 환율 관리에 등록되어 있지 않습니다 — 먼저 입력해야 엑셀을 다운로드할 수 있습니다.</AlertDescription>
              </Alert>
            )}
            {invoiceData.ships_missing_calc.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  아직 관리비 계산이 안 된 선박 {invoiceData.ships_missing_calc.length}척은 이번 청구서에서 0원으로 표시됩니다 — 관리비 계산 화면에서 먼저 계산하세요:
                  {' '}{invoiceData.ships_missing_calc.map(s => s.ship_name).join(', ')}
                </AlertDescription>
              </Alert>
            )}
            <InvoiceShipTable data={invoiceData} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function InvoiceShipTable({ data }: { data: ManagementFeeInvoiceData }) {
  return (
    <>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">선박</TableHead>
              <TableHead className="text-xs text-center">선원수</TableHead>
              <TableHead className="text-xs text-right">급여(총급여-OBP)</TableHead>
              <TableHead className="text-xs text-right">상병수당</TableHead>
              <TableHead className="text-xs text-right">재고용수당</TableHead>
              <TableHead className="text-xs text-right">관리비/실비 합</TableHead>
              <TableHead className="text-xs text-right">USD 합계</TableHead>
              <TableHead className="text-xs text-right">KRW 합계</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.ships.map(s => {
              const feeAndActualSum = Object.values(s.fee_item_totals).reduce((a, b) => a + b, 0) + Object.values(s.actual_cost_totals).reduce((a, b) => a + b, 0);
              return (
                <TableRow key={s.ship_id}>
                  <TableCell className="text-xs font-medium">
                    {s.ship_name}{!s.period_id && <span className="ml-1 text-amber-600">(계산 필요)</span>}
                    {s.warnings.length > 0 && <span className="ml-1 text-red-600" title={s.warnings.join(', ')}>⚠</span>}
                  </TableCell>
                  <TableCell className="text-xs text-center">{s.crew_count}</TableCell>
                  <TableCell className="text-xs text-right font-mono">{fmt(s.payroll_gross_minus_obp)}</TableCell>
                  <TableCell className="text-xs text-right font-mono">{fmt(s.sick_pay_total)}</TableCell>
                  <TableCell className="text-xs text-right font-mono">{fmt(s.reemployment_allowance_total)}</TableCell>
                  <TableCell className="text-xs text-right font-mono">{fmt(feeAndActualSum)}</TableCell>
                  <TableCell className="text-xs text-right font-mono font-semibold">{fmt(s.usd_total)}</TableCell>
                  <TableCell className="text-xs text-right font-mono font-semibold">{fmt(s.krw_total)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <div className="flex justify-end gap-6 text-sm font-semibold pt-1">
        <span>USD 총합계: {fmt(data.grand_total_usd)}</span>
        <span>KRW 총합계: {fmt(data.grand_total_krw)}</span>
      </div>
    </>
  );
}

// ── 일괄 작성 ─────────────────────────────────────────────
function BulkInvoiceTab({ ships, owners, fleets, bankAccounts }: { ships: Ship[]; owners: Company[]; fleets: Fleet[]; bankAccounts: BankAccountWithBalance[] }) {
  const { toast } = useToast();
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [selectedShipIds, setSelectedShipIds] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState<{ ownerId: string; ownerName: string; status: 'ok' | 'no_rate' | 'error'; message?: string }[] | null>(null);

  const targetOwnerIds = resolveOwnerIds(selectedShipIds, ships);

  const handleBulkRun = async () => {
    if (targetOwnerIds.length === 0) { toast({ title: '선주/플릿/선박을 하나 이상 선택하세요.', variant: 'destructive' }); return; }
    setProcessing(true);
    setResults(null);
    const rows: { ownerId: string; ownerName: string; status: 'ok' | 'no_rate' | 'error'; message?: string }[] = [];
    try {
      const companyInfo = await getCompanyInfo();
      for (const ownerId of targetOwnerIds) {
        const ownerName = owners.find(o => o.id === ownerId)?.name || ownerId;
        try {
          const settings = await managementFeeInvoiceService.getOrCreateDraftInvoice(ownerId, yearMonth);
          if (!settings) { rows.push({ ownerId, ownerName, status: 'error', message: '청구서 생성 실패' }); continue; }
          const data = await managementFeeInvoiceService.getInvoiceData(ownerId, yearMonth);
          if (!data) { rows.push({ ownerId, ownerName, status: 'error', message: '데이터 조회 실패' }); continue; }
          if (!data.krw_rate_to_usd) { rows.push({ ownerId, ownerName, status: 'no_rate', message: 'KRW 환율 미등록 — 임시저장만 됨' }); continue; }

          const actualCostEntriesByShip = await buildActualCostEntriesByShip(data);
          const usdAccount = bankAccounts.find(a => a.id === settings.usd_bank_account_id) || null;
          const krwAccount = bankAccounts.find(a => a.id === settings.krw_bank_account_id) || null;
          await exportManagementFeeInvoiceToExcel({
            data, docNumber: settings.doc_number, exchangeRate: data.krw_rate_to_usd,
            usdBankAccount: usdAccount, krwBankAccount: krwAccount,
            companyInfo: companyInfo || { name: '' }, actualCostEntriesByShip,
          });
          await managementFeeInvoiceService.markIssued(settings.id, data.krw_rate_to_usd);
          rows.push({ ownerId, ownerName, status: 'ok' });
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
        <CardHeader className="pb-3"><CardTitle className="text-base">청구서 일괄 작성</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-gray-500">
            선주/플릿/선박을 선택하면 선박이 속한 선주들의 청구서를 한 번에 만듭니다(문서번호 자동 발급 + 임시저장 → 그 달 KRW 환율이 등록돼 있으면 바로 엑셀 다운로드까지, 없으면 임시저장만 진행).
          </p>
          <div className="space-y-1.5">
            <Label className="text-xs">청구 월</Label>
            <Input type="month" value={yearMonth} onChange={e => setYearMonth(e.target.value)} className="h-9 text-sm w-40" />
          </div>
          <OwnerFleetShipCheckTree
            ships={ships}
            companies={owners}
            fleets={fleets}
            selectedShipIds={selectedShipIds}
            onChange={setSelectedShipIds}
          />
          <div className="flex justify-end">
            <Button size="sm" className="gap-1.5" onClick={handleBulkRun} disabled={processing || targetOwnerIds.length === 0}>
              <FileSpreadsheet className="h-4 w-4" />{processing ? '처리 중...' : `일괄 작성 (${targetOwnerIds.length}개 선주)`}
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
                  <Badge variant={r.status === 'ok' ? 'default' : r.status === 'no_rate' ? 'secondary' : 'destructive'} className="text-[10px]">
                    {r.status === 'ok' ? '완료' : r.status === 'no_rate' ? '환율 없음' : '실패'}
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
function InvoiceListTab() {
  const [rows, setRows] = useState<ManagementFeeInvoiceListRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        setRows(await managementFeeInvoiceService.listInvoices());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="text-center py-8 text-sm text-gray-400">불러오는 중...</div>;

  return (
    <Card>
      <CardContent className="pt-4">
        {rows.length === 0 ? (
          <div className="text-center py-8 text-sm text-gray-400">작성된 청구서가 없습니다.</div>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">문서번호</TableHead>
                  <TableHead className="text-xs">선주</TableHead>
                  <TableHead className="text-xs">청구 월</TableHead>
                  <TableHead className="text-xs">상태</TableHead>
                  <TableHead className="text-xs">발행일</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs font-mono">{r.doc_number}</TableCell>
                    <TableCell className="text-xs font-medium">{r.owner_name}</TableCell>
                    <TableCell className="text-xs">{r.year_month}</TableCell>
                    <TableCell><Badge variant={r.status === 'issued' ? 'default' : 'secondary'} className="text-xs">{r.status === 'issued' ? '발행됨' : '임시저장'}</Badge></TableCell>
                    <TableCell className="text-xs text-gray-500">{r.issued_at ? new Date(r.issued_at).toLocaleString('ko-KR') : '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <p className="text-xs text-gray-400 mt-2">이어서 작성하려면 "단일 작성" 탭에서 같은 선주/월을 다시 선택하세요.</p>
      </CardContent>
    </Card>
  );
}
