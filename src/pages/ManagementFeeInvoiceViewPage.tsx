import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { FileSpreadsheet, FileText, Calculator } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useTabContext } from '@/contexts/TabContext';
import { getCompanyInfo } from '@/services/company-info.service';
import { getBankAccounts } from '@/services/accounting-bank-account.service';
import { managementFeeInvoiceService, type ManagementFeeInvoiceData, type ManagementFeeInvoiceSettings } from '@/services/management-fee-invoice.service';
import type { ManagementFeeLedgerActualCostEntry } from '@/services/management-fee-calc.service';
import { exportManagementFeeInvoiceToExcel, DETAIL_GROUPS } from '@/utils/management-fee-invoice-export';
import { buildActualCostEntriesByShip } from '@/pages/ManagementFeeInvoicePage';
import type { BankAccountWithBalance } from '@/types/accounting';
import type { CompanyInfo } from '@/services/company-info.service';

const fmt = (n: number) => n.toLocaleString('en-US');
const fmt2 = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// 청구서 목록에서 청구서를 클릭하면 오는 화면 — 실제 발행되는 엑셀 청구서(표지/비용상세내역/
// 승하선 비용상세 3개 시트)와 최대한 동일한 내용을 앱 안에서 바로 확인할 수 있게 한다.
// 저장·인쇄가 필요하면 "엑셀 다운로드" 버튼으로 실제 엑셀 파일을 받는다.
export default function ManagementFeeInvoiceViewPage() {
  const { ownerId, yearMonth } = useParams<{ ownerId: string; yearMonth: string }>();
  const { toast } = useToast();
  const { openNewTab } = useTabContext();

  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<ManagementFeeInvoiceSettings | null>(null);
  const [data, setData] = useState<ManagementFeeInvoiceData | null>(null);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
  const [bankAccounts, setBankAccounts] = useState<BankAccountWithBalance[]>([]);
  const [actualCostEntriesByShip, setActualCostEntriesByShip] = useState<Record<string, ManagementFeeLedgerActualCostEntry[]>>({});
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!ownerId || !yearMonth) return;
    (async () => {
      setLoading(true);
      try {
        const [s, d, info, accounts] = await Promise.all([
          managementFeeInvoiceService.getInvoiceSettings(ownerId, yearMonth),
          managementFeeInvoiceService.getInvoiceData(ownerId, yearMonth),
          getCompanyInfo(),
          getBankAccounts(),
        ]);
        setSettings(s);
        setData(d);
        setCompanyInfo(info);
        setBankAccounts(accounts);
        if (d) setActualCostEntriesByShip(await buildActualCostEntriesByShip(d));
      } finally {
        setLoading(false);
      }
    })();
  }, [ownerId, yearMonth]);

  const handleExport = async () => {
    if (!data || !settings) return;
    if (!data.krw_rate_to_usd) { toast({ title: '환율 관리에서 이 달의 KRW 환율을 먼저 입력하세요.', variant: 'destructive' }); return; }
    setExporting(true);
    try {
      const usdAccount = bankAccounts.find(a => a.id === settings.usd_bank_account_id) || null;
      const krwAccount = bankAccounts.find(a => a.id === settings.krw_bank_account_id) || null;
      await exportManagementFeeInvoiceToExcel({
        data,
        docNumber: settings.doc_number,
        exchangeRate: data.krw_rate_to_usd,
        usdBankAccount: usdAccount,
        krwBankAccount: krwAccount,
        companyInfo: companyInfo || { name: '' },
        actualCostEntriesByShip,
      });
      await managementFeeInvoiceService.markIssued(settings.id, data.krw_rate_to_usd);
      const refreshed = await managementFeeInvoiceService.getInvoiceSettings(ownerId!, yearMonth!);
      setSettings(refreshed);
      toast({ title: '엑셀 다운로드 완료' });
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><p className="text-sm text-gray-500">불러오는 중...</p></div>;
  }

  if (!data || !ownerId || !yearMonth) {
    return <div className="max-w-4xl mx-auto px-4 py-8"><p className="text-sm text-gray-500 text-center">청구서를 찾을 수 없습니다.</p></div>;
  }

  const usdAccount = bankAccounts.find(a => a.id === settings?.usd_bank_account_id) || null;
  const krwAccount = bankAccounts.find(a => a.id === settings?.krw_bank_account_id) || null;

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <FileText className="w-5 h-5 text-muted-foreground" />
            {data.owner_name} — {data.year_month} 관리비 청구서
          </h1>
          <div className="flex items-center gap-2 mt-1">
            {settings && (
              <>
                <span className="text-xs text-gray-500 font-mono">{settings.doc_number}</span>
                <Badge variant={settings.status === 'issued' ? 'default' : 'secondary'} className="text-xs">
                  {settings.status === 'issued' ? '발행됨' : '임시저장'}
                </Badge>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm" variant="outline" className="gap-1.5 h-8"
            onClick={() => openNewTab(`/management-fee-calculation?owner=${ownerId}&month=${yearMonth}`, `관리비 계산: ${data.owner_name} ${yearMonth}`, true)}
          >
            <Calculator className="h-4 w-4" />관리비 계산 보기
          </Button>
          <Button size="sm" className="gap-1.5 h-8" onClick={handleExport} disabled={exporting || !data.krw_rate_to_usd}>
            <FileSpreadsheet className="h-4 w-4" />{exporting ? '생성 중...' : '엑셀 다운로드'}
          </Button>
        </div>
      </div>

      {!data.krw_rate_to_usd && (
        <Alert variant="destructive">
          <AlertDescription className="text-xs">이 달의 KRW 환율이 환율 관리에 등록되어 있지 않아 엑셀 다운로드를 할 수 없습니다.</AlertDescription>
        </Alert>
      )}
      {data.ships_missing_calc.length > 0 && (
        <Alert variant="destructive">
          <AlertDescription className="text-xs">
            아직 관리비 계산이 안 된 선박 {data.ships_missing_calc.length}척은 0원으로 표시됩니다: {data.ships_missing_calc.map(s => s.ship_name).join(', ')}
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="cover">
        <TabsList className="h-9">
          <TabsTrigger value="cover" className="text-xs">표지</TabsTrigger>
          <TabsTrigger value="detail" className="text-xs">비용상세내역</TabsTrigger>
          <TabsTrigger value="actualcost" className="text-xs">승하선 비용상세</TabsTrigger>
        </TabsList>

        <TabsContent value="cover" className="mt-3">
          <CoverSheetView data={data} docNumber={settings?.doc_number || '-'} companyInfo={companyInfo} usdAccount={usdAccount} krwAccount={krwAccount} />
        </TabsContent>
        <TabsContent value="detail" className="mt-3">
          <DetailSheetView data={data} />
        </TabsContent>
        <TabsContent value="actualcost" className="mt-3">
          <ActualCostSheetView data={data} actualCostEntriesByShip={actualCostEntriesByShip} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

const th = 'text-xs font-semibold text-gray-700 bg-gray-100 border border-gray-200 px-2 py-1.5 text-center';
const td = 'text-xs border border-gray-200 px-2 py-1.5';
const tdRight = `${td} text-right font-mono`;
const totalRow = 'bg-gray-50 font-semibold';

function CoverSheetView({
  data, docNumber, companyInfo, usdAccount, krwAccount,
}: {
  data: ManagementFeeInvoiceData;
  docNumber: string;
  companyInfo: CompanyInfo | null;
  usdAccount: BankAccountWithBalance | null;
  krwAccount: BankAccountWithBalance | null;
}) {
  return (
    <div className="bg-white border rounded-md p-6 space-y-4 text-sm">
      <div className="text-center space-y-0.5">
        <div className="text-lg font-bold">{companyInfo?.name || ''}</div>
        <div className="text-xs text-gray-500">{companyInfo?.address || ''}</div>
        <div className="text-xs text-gray-500">
          {[companyInfo?.phone && `Tel: ${companyInfo.phone}`, companyInfo?.fax && `Fax: ${companyInfo.fax}`, companyInfo?.email && `E-mail: ${companyInfo.email}`].filter(Boolean).join('   ')}
        </div>
      </div>

      <div className="space-y-1 text-xs">
        <div><span className="text-gray-500 inline-block w-20">문서번호 :</span><span className="font-semibold">{docNumber}</span></div>
        <div><span className="text-gray-500 inline-block w-20">수&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;신 :</span><span className="font-semibold">{data.owner_name}</span></div>
        <div><span className="text-gray-500 inline-block w-20">발&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;신 :</span><span className="font-semibold">{companyInfo?.name || ''}</span></div>
        <div><span className="text-gray-500 inline-block w-20">제&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;목 :</span><span className="font-semibold">{data.year_month} 선원 관리비 및 기타 발생 경비 청구</span></div>
      </div>

      <div className="text-xs space-y-1.5">
        <p>1. 귀사의 일익 번창하심을 기원합니다.</p>
        <p>2. {data.year_month} 관리비 청구서를 제출하오니 아래의 계좌로 송금해 주시면 감사하겠습니다.</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={th}>MONTH</th>
              <th className={`${th} text-left`} colSpan={4}>VESSEL</th>
              <th className={th}>외화청구 상세내역</th>
              <th className={th}>원화청구 상세내역</th>
            </tr>
          </thead>
          <tbody>
            {data.ships.map((s, idx) => (
              <tr key={s.ship_id}>
                <td className={`${td} text-center`}>{idx === 0 ? data.year_month : ''}</td>
                <td className={`${td} font-semibold`} colSpan={4}>{s.ship_name}</td>
                <td className={tdRight}>{fmt2(s.usd_total)}</td>
                <td className={tdRight}>{fmt(s.krw_total)}</td>
              </tr>
            ))}
            <tr className={totalRow}>
              <td className={td}></td>
              <td className={`${td} font-semibold`} colSpan={4}>{`TOTAL AMOUNT (${data.ships.length} vessels)`}</td>
              <td className={tdRight}>{fmt2(data.grand_total_usd)}</td>
              <td className={tdRight}>{fmt(data.grand_total_krw)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {data.krw_rate_to_usd && (
        <p className="text-[11px] text-gray-400">적용 환율: 1 USD = {fmt(data.krw_rate_to_usd)} KRW</p>
      )}

      <div className="grid grid-cols-2 gap-6 pt-2">
        <div>
          <div className="text-xs font-semibold mb-1">&lt; 외화계좌 &gt;</div>
          {usdAccount ? (
            <div className="text-xs text-gray-600 space-y-0.5">
              <div>예금주: {usdAccount.account_holder}</div>
              <div>은행명: {usdAccount.bank_name}</div>
              <div>계좌번호: {usdAccount.account_number}</div>
            </div>
          ) : <div className="text-xs text-gray-400">등록된 계좌 없음</div>}
        </div>
        <div>
          <div className="text-xs font-semibold mb-1">&lt; 원화계좌 &gt;</div>
          {krwAccount ? (
            <div className="text-xs text-gray-600 space-y-0.5">
              <div>예금주: {krwAccount.account_holder}</div>
              <div>은행명: {krwAccount.bank_name}</div>
              <div>계좌번호: {krwAccount.account_number}</div>
            </div>
          ) : <div className="text-xs text-gray-400">등록된 계좌 없음</div>}
        </div>
      </div>

      <div className="text-right text-xs pt-4 space-y-0.5">
        <div>Very truly yours,</div>
        <div className="font-semibold">{companyInfo?.name || ''}</div>
      </div>
    </div>
  );
}

function DetailSheetView({ data }: { data: ManagementFeeInvoiceData }) {
  return (
    <div className="bg-white border rounded-md p-4">
      <div className="text-center font-bold text-sm mb-3">비용 상세 내역서</div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={th}></th>
              <th className={th}></th>
              {data.ships.map(s => <th key={s.ship_id} className={th}>{s.ship_name}</th>)}
              <th className={`${th} bg-gray-200`}>TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {DETAIL_GROUPS.map(group => group.rows.map((row, ri) => {
              const values = data.ships.map(s => row.getValue(s));
              const total = values.reduce((s, v) => s + v, 0);
              return (
                <tr key={`${group.label}::${row.label}`}>
                  <td className={`${td} font-semibold`}>{ri === 0 ? group.label : ''}</td>
                  <td className={td}>{row.label}</td>
                  {values.map((v, i) => <td key={i} className={tdRight}>{fmt2(v)}</td>)}
                  <td className={`${tdRight} ${totalRow}`}>{fmt2(total)}</td>
                </tr>
              );
            }))}
            <tr className={totalRow}>
              <td className={td} colSpan={2}>외화 총액</td>
              {data.ships.map(s => <td key={s.ship_id} className={tdRight}>{fmt2(s.usd_total)}</td>)}
              <td className={tdRight}>{fmt2(data.grand_total_usd)}</td>
            </tr>
            <tr className={totalRow}>
              <td className={td} colSpan={2}>원화 총액</td>
              {data.ships.map(s => <td key={s.ship_id} className={tdRight}>{fmt(s.krw_total)}</td>)}
              <td className={tdRight}>{fmt(data.grand_total_krw)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ActualCostSheetView({
  data, actualCostEntriesByShip,
}: {
  data: ManagementFeeInvoiceData;
  actualCostEntriesByShip: Record<string, ManagementFeeLedgerActualCostEntry[]>;
}) {
  const headerLabels = ['선박', '비용', '화폐단위', '개별 금액', '개수/인원', '금액(USD)', '비고'];
  const rows = data.ships.flatMap(ship => (actualCostEntriesByShip[ship.ship_id] || []).map(e => ({ ship, e })));

  return (
    <div className="bg-white border rounded-md p-4">
      <div className="text-center font-bold text-sm mb-3">승/하선 비용내역서</div>
      {rows.length === 0 ? (
        <div className="text-center py-6 text-sm text-gray-400">실비 기록이 없습니다.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>{headerLabels.map(label => <th key={label} className={th}>{label}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map(({ ship, e }, idx) => (
                <tr key={`${ship.ship_id}::${idx}`}>
                  <td className={td}>{ship.ship_name}</td>
                  <td className={td}>{e.fee_item_name}</td>
                  <td className={`${td} text-center`}>{e.currency}</td>
                  <td className={tdRight}>{e.unit_price != null ? fmt(e.unit_price) : ''}</td>
                  <td className={`${td} text-center`}>{e.quantity ?? ''}</td>
                  <td className={`${tdRight} font-semibold`}>{fmt2(e.amount_usd)}</td>
                  <td className={td}>{e.remark || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
