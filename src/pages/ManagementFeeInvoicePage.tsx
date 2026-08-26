import { useState, useEffect } from 'react';
import { FileSpreadsheet, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { getCurrentUser, getCompanies } from '@/lib/store';
import { getCompanyInfo } from '@/services/company-info.service';
import { getBankAccounts } from '@/services/accounting-bank-account.service';
import { managementFeeCalcService, type ManagementFeeLedgerActualCostEntry } from '@/services/management-fee-calc.service';
import { managementFeeInvoiceService, type ManagementFeeInvoiceData } from '@/services/management-fee-invoice.service';
import { exportManagementFeeInvoiceToExcel } from '@/utils/management-fee-invoice-export';
import type { Company } from '@/types/models';
import type { BankAccountWithBalance } from '@/types/accounting';

const currentYearMonth = () => new Date().toISOString().slice(0, 7);
const fmt = (n: number) => n.toLocaleString('en-US');

export default function ManagementFeeInvoicePage() {
  const { toast } = useToast();

  const [owners, setOwners] = useState<Company[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccountWithBalance[]>([]);
  const [ownerId, setOwnerId] = useState('');
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [docNumber, setDocNumber] = useState('');
  const [exchangeRate, setExchangeRate] = useState('');
  const [usdBankAccountId, setUsdBankAccountId] = useState('');
  const [krwBankAccountId, setKrwBankAccountId] = useState('');

  const [loading, setLoading] = useState(false);
  const [invoiceData, setInvoiceData] = useState<ManagementFeeInvoiceData | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    (async () => {
      const [companies, accounts] = await Promise.all([getCompanies(), getBankAccounts()]);
      setOwners(companies.filter(c => c.type === 'owner'));
      setBankAccounts(accounts);
    })();
  }, []);

  useEffect(() => {
    if (!ownerId) { setDocNumber(''); setExchangeRate(''); setUsdBankAccountId(''); setKrwBankAccountId(''); setInvoiceData(null); return; }
    (async () => {
      const settings = await managementFeeInvoiceService.getInvoiceSettings(ownerId, yearMonth);
      setDocNumber(settings?.doc_number || '');
      setExchangeRate(settings?.exchange_rate ? String(settings.exchange_rate) : '');
      setUsdBankAccountId(settings?.usd_bank_account_id || '');
      setKrwBankAccountId(settings?.krw_bank_account_id || '');
      setInvoiceData(null);
    })();
  }, [ownerId, yearMonth]);

  const handlePreview = async () => {
    if (!ownerId) { toast({ title: '선주를 선택하세요.', variant: 'destructive' }); return; }
    const rate = parseFloat(exchangeRate);
    if (!rate || rate <= 0) { toast({ title: '환율을 입력하세요.', variant: 'destructive' }); return; }
    setLoading(true);
    try {
      const data = await managementFeeInvoiceService.getInvoiceData(ownerId, yearMonth, rate);
      if (!data) { toast({ title: '데이터를 불러오지 못했습니다.', variant: 'destructive' }); return; }
      setInvoiceData(data);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!invoiceData) return;
    const rate = parseFloat(exchangeRate);
    if (!rate || rate <= 0) { toast({ title: '환율을 입력하세요.', variant: 'destructive' }); return; }
    setExporting(true);
    try {
      const user = await getCurrentUser();
      await managementFeeInvoiceService.saveInvoiceSettings({
        owner_id: ownerId,
        year_month: yearMonth,
        doc_number: docNumber,
        exchange_rate: rate,
        usd_bank_account_id: usdBankAccountId || null,
        krw_bank_account_id: krwBankAccountId || null,
        created_by: user?.id,
      });

      const [companyInfo, entriesLists] = await Promise.all([
        getCompanyInfo(),
        Promise.all(invoiceData.ships.map(async s => ({
          shipId: s.ship_id,
          entries: s.period_id ? (await managementFeeCalcService.getLedgerForPeriod(s.period_id))?.actual_cost_entries || [] : [] as ManagementFeeLedgerActualCostEntry[],
        }))),
      ]);
      const actualCostEntriesByShip: Record<string, ManagementFeeLedgerActualCostEntry[]> = {};
      entriesLists.forEach(({ shipId, entries }) => { actualCostEntriesByShip[shipId] = entries; });

      const usdAccount = bankAccounts.find(a => a.id === usdBankAccountId) || null;
      const krwAccount = bankAccounts.find(a => a.id === krwBankAccountId) || null;

      await exportManagementFeeInvoiceToExcel({
        data: invoiceData,
        docNumber,
        exchangeRate: rate,
        usdBankAccount: usdAccount,
        krwBankAccount: krwAccount,
        companyInfo: companyInfo || { name: '' },
        actualCostEntriesByShip,
      });
      toast({ title: '엑셀 다운로드 완료' });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><FileSpreadsheet className="w-5 h-5 text-muted-foreground" />관리비 청구서</h1>
        <p className="text-xs text-muted-foreground mt-1">
          선주 소속 선박들의 관리비 계산 결과 + 실비 항목 기록 + 급여(총급여-OBP)/상병수당/재고용수당을 모아 청구서 엑셀을 생성합니다.
          선박별로 관리비 계산({`관리비 계산`} 화면)이 먼저 되어 있어야 합니다.
        </p>
      </div>

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
              <Input value={docNumber} onChange={e => setDocNumber(e.target.value)} placeholder="예: INK S-21-103" className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">환율 (1 USD = ? KRW)</Label>
              <Input type="number" min={0} value={exchangeRate} onChange={e => setExchangeRate(e.target.value)} placeholder="예: 1330" className="h-9 text-sm" />
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
          <div className="flex justify-end">
            <Button size="sm" onClick={handlePreview} disabled={loading}>{loading ? '불러오는 중...' : '미리보기'}</Button>
          </div>
        </CardContent>
      </Card>

      {invoiceData && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{invoiceData.owner_name} — {invoiceData.year_month}</CardTitle>
              <Button size="sm" className="gap-1.5" onClick={handleExport} disabled={exporting}>
                <FileSpreadsheet className="h-4 w-4" />{exporting ? '생성 중...' : '엑셀 다운로드'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {invoiceData.ships_missing_calc.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  아직 관리비 계산이 안 된 선박 {invoiceData.ships_missing_calc.length}척은 이번 청구서에서 0원으로 표시됩니다 — 관리비 계산 화면에서 먼저 계산하세요:
                  {' '}{invoiceData.ships_missing_calc.map(s => s.ship_name).join(', ')}
                </AlertDescription>
              </Alert>
            )}
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
                  {invoiceData.ships.map(s => {
                    const feeAndActualSum = Object.values(s.fee_item_totals).reduce((a, b) => a + b, 0) + Object.values(s.actual_cost_totals).reduce((a, b) => a + b, 0);
                    return (
                      <TableRow key={s.ship_id}>
                        <TableCell className="text-xs font-medium">{s.ship_name}{!s.period_id && <span className="ml-1 text-amber-600">(계산 필요)</span>}</TableCell>
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
              <span>USD 총합계: {fmt(invoiceData.grand_total_usd)}</span>
              <span>KRW 총합계: {fmt(invoiceData.grand_total_krw)}</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
