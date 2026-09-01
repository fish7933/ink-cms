import * as XLSX from 'xlsx-js-style';
import { cell, border, HEADER, RESULT_HEADER, TOTAL_ROW_BG, BASE_SZ, autoColWidths, applyPrintFit } from '@/utils/crew-payroll-export';
import type { ManagementFeeInvoiceData, ManagementFeeInvoiceShipData } from '@/services/management-fee-invoice.service';
import type { ManagementFeeLedgerActualCostEntry } from '@/services/management-fee-calc.service';

export interface BankAccountInfo {
  bank_name: string;
  account_number: string;
  account_holder: string;
}

export interface CompanyLetterhead {
  name: string;
  address?: string;
  phone?: string;
  fax?: string;
  email?: string;
}

export interface ManagementFeeInvoiceExportInput {
  data: ManagementFeeInvoiceData;
  docNumber: string;
  exchangeRate: number;
  usdBankAccount?: BankAccountInfo | null;
  krwBankAccount?: BankAccountInfo | null;
  companyInfo: CompanyLetterhead;
  actualCostEntriesByShip: Record<string, ManagementFeeLedgerActualCostEntry[]>;
}

const fmt = (n: number) => n.toLocaleString('en-US');

// "승선공인 인지대" 계열 잡비(위험물 적재/구명정수/당직부원증/IGF Code 인지대 + 사진 현상비)는
// 실제 청구서 샘플에서 "승선공인 인지대 외" 한 줄로 합쳐 청구된다(실측: GAS DREAM $4.86 =
// 사진 현상비 단독 발생분과 정확히 일치, 다른 인지대류는 그 달엔 0이었음).
const BOARDING_STAMP_DUTY_BUNDLE = ['승선공인 인지대', '위험물 적재 인지대', '구명정수 인지대', '당직부원증 인지대', 'IGF Code 인지대', '사진 현상비'];

export interface DetailRow {
  label: string;
  getValue: (s: ManagementFeeInvoiceShipData) => number;
}

export interface DetailGroup {
  label: string;
  rows: DetailRow[];
}

const sumActualCost = (s: ManagementFeeInvoiceShipData, names: string[]) => names.reduce((sum, n) => sum + (s.actual_cost_totals[n] || 0), 0);

export const DETAIL_GROUPS: DetailGroup[] = [
  { label: '인원', rows: [{ label: '총 선원수', getValue: s => s.crew_count }] },
  {
    label: '급여',
    rows: [
      { label: '선원급여(총급여-OBP)', getValue: s => s.payroll_gross_minus_obp },
      { label: '선원급여(상병수당)', getValue: s => s.sick_pay_total },
      { label: '재고용수당', getValue: s => s.reemployment_allowance_total },
    ],
  },
  {
    label: '대리점비',
    rows: [
      { label: '대리점비', getValue: s => s.fee_item_totals['대리점비'] || 0 },
      { label: '통신비', getValue: s => s.fee_item_totals['통신비'] || 0 },
      { label: '선원선발/교육비', getValue: s => s.fee_item_totals['선발비'] || 0 },
    ],
  },
  {
    label: '승선자 비용',
    rows: [
      { label: '승·하선자 핸들링비', getValue: s => s.actual_cost_totals['승·하선자 핸들링비'] || 0 },
      { label: 'KPI', getValue: s => s.actual_cost_totals['KPI'] || 0 },
      { label: 'SD Fee', getValue: s => s.actual_cost_totals['SD Fee'] || 0 },
      { label: '비자발급비 (VISA)', getValue: s => s.actual_cost_totals['비자발급비 (VISA)'] || 0 },
      { label: '해사법규 교육비 (KML)', getValue: s => s.actual_cost_totals['해사법규 교육비 (KML)'] || 0 },
      { label: '승선공인 인지대 외', getValue: s => sumActualCost(s, BOARDING_STAMP_DUTY_BUNDLE) },
      { label: '신체검사비 (MCU)', getValue: s => (s.fee_item_totals['신체검사비'] || 0) + (s.actual_cost_totals['신체검사비'] || 0) },
      { label: '파나마증서 발급비 (PANAMA)', getValue: s => s.actual_cost_totals['파나마증서 발급비 (PANAMA)'] || 0 },
      { label: 'Ecdis Type Specific Training', getValue: s => s.actual_cost_totals['Ecdis Type Specific Training'] || 0 },
    ],
  },
  {
    label: '하선자 비용',
    rows: [
      { label: '하선공인 인지대', getValue: s => s.actual_cost_totals['하선공인 인지대'] || 0 },
      { label: '하선자급여 현찰수수료 및 송금수수료', getValue: s => s.actual_cost_totals['하선자급여 현찰수수료 및 송금수수료'] || 0 },
    ],
  },
  {
    label: '기타',
    rows: [
      { label: '기타 지급(ETC)', getValue: s => s.actual_cost_totals['기타 지급(ETC)'] || 0 },
      { label: 'Refund of Crew Change Expense', getValue: s => s.actual_cost_totals['Refund of Crew Change Expense'] || 0 },
    ],
  },
];

function buildCoverSheet(input: ManagementFeeInvoiceExportInput): XLSX.WorkSheet {
  const { data, docNumber, exchangeRate, usdBankAccount, krwBankAccount, companyInfo } = input;
  const COLS = 7;
  const aoa: ReturnType<typeof cell>[][] = [];
  const blank = () => Array.from({ length: COLS }, () => cell('', {}));
  const titleCell = { font: { bold: true, sz: 14 }, alignment: { horizontal: 'center' as const } };
  const subCell = { font: { sz: 9, color: { rgb: '666666' } }, alignment: { horizontal: 'center' as const } };
  const labelCell = { font: { sz: BASE_SZ, color: { rgb: '777777' } } };
  const valueCell = { font: { sz: BASE_SZ, bold: true } };

  aoa.push([cell(companyInfo.name, titleCell), ...Array.from({ length: COLS - 1 }, () => cell('', {}))]);
  aoa.push([cell(companyInfo.address || '', subCell), ...Array.from({ length: COLS - 1 }, () => cell('', {}))]);
  aoa.push([cell(
    [companyInfo.phone && `Tel: ${companyInfo.phone}`, companyInfo.fax && `Fax: ${companyInfo.fax}`, companyInfo.email && `E-mail: ${companyInfo.email}`].filter(Boolean).join('   '),
    subCell,
  ), ...Array.from({ length: COLS - 1 }, () => cell('', {}))]);
  aoa.push(blank());

  aoa.push([cell('문서번호 :', labelCell), cell(docNumber || '-', valueCell), ...Array.from({ length: COLS - 2 }, () => cell('', {}))]);
  aoa.push([cell('수      신 :', labelCell), cell(data.owner_name, valueCell), ...Array.from({ length: COLS - 2 }, () => cell('', {}))]);
  aoa.push([cell('발      신 :', labelCell), cell(companyInfo.name, valueCell), ...Array.from({ length: COLS - 2 }, () => cell('', {}))]);
  aoa.push([cell('제      목 :', labelCell), cell(`${data.year_month} 선원 관리비 및 기타 발생 경비 청구`, valueCell), ...Array.from({ length: COLS - 2 }, () => cell('', {}))]);
  aoa.push(blank());
  aoa.push([cell('1. 귀사의 일익 번창하심을 기원합니다.', { font: { sz: BASE_SZ } }), ...Array.from({ length: COLS - 1 }, () => cell('', {}))]);
  aoa.push(blank());
  aoa.push([cell(`2. ${data.year_month} 관리비 청구서를 제출하오니 아래의 계좌로 송금해 주시면 감사하겠습니다.`, { font: { sz: BASE_SZ } }), ...Array.from({ length: COLS - 1 }, () => cell('', {}))]);
  aoa.push(blank());

  const tableHeaderRow = aoa.length;
  aoa.push(['MONTH', 'VESSEL', '', '', '', '외화청구 상세내역', '원화청구 상세내역'].map(label => cell(label, {
    font: { bold: true, sz: BASE_SZ, color: { rgb: HEADER.fg } },
    fill: { fgColor: { rgb: HEADER.bg } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: border({ thickTop: true, thickBottom: true }),
  })));

  data.ships.forEach((s, idx) => {
    aoa.push([
      cell(idx === 0 ? data.year_month : '', { alignment: { horizontal: 'center' }, font: { sz: BASE_SZ }, border: border() }),
      cell(s.ship_name, { font: { sz: BASE_SZ, bold: true }, border: border() }),
      cell('', { border: border() }),
      cell('', { border: border() }),
      cell('', { border: border() }),
      cell(s.usd_total, { numFmt: '#,##0.00', alignment: { horizontal: 'right' }, font: { sz: BASE_SZ }, border: border({ thickBottom: idx === data.ships.length - 1 }) }),
      cell(s.krw_total, { numFmt: '#,##0', alignment: { horizontal: 'right' }, font: { sz: BASE_SZ }, border: border({ thickBottom: idx === data.ships.length - 1 }) }),
    ]);
  });

  aoa.push([
    cell('', { fill: { fgColor: { rgb: TOTAL_ROW_BG } }, border: border({ thickTop: true }) }),
    cell(`TOTAL AMOUNT (${data.ships.length} vessels)`, { font: { bold: true, sz: BASE_SZ }, fill: { fgColor: { rgb: TOTAL_ROW_BG } }, border: border({ thickTop: true }) }),
    cell('', { fill: { fgColor: { rgb: TOTAL_ROW_BG } }, border: border({ thickTop: true }) }),
    cell('', { fill: { fgColor: { rgb: TOTAL_ROW_BG } }, border: border({ thickTop: true }) }),
    cell('', { fill: { fgColor: { rgb: TOTAL_ROW_BG } }, border: border({ thickTop: true }) }),
    cell(data.grand_total_usd, { numFmt: '#,##0.00', alignment: { horizontal: 'right' }, font: { bold: true, sz: BASE_SZ }, fill: { fgColor: { rgb: TOTAL_ROW_BG } }, border: border({ thickTop: true }) }),
    cell(data.grand_total_krw, { numFmt: '#,##0', alignment: { horizontal: 'right' }, font: { bold: true, sz: BASE_SZ }, fill: { fgColor: { rgb: TOTAL_ROW_BG } }, border: border({ thickTop: true }) }),
  ]);
  aoa.push(blank());
  aoa.push([cell(`적용 환율: 1 USD = ${fmt(exchangeRate)} KRW`, { font: { sz: 8, color: { rgb: '999999' } } }), ...Array.from({ length: COLS - 1 }, () => cell('', {}))]);
  aoa.push(blank());

  aoa.push([
    cell('< 외화계좌 >', { font: { bold: true, sz: BASE_SZ } }), cell('', {}), cell('', {}), cell('', {}), cell('', {}),
    cell('< 원화계좌 >', { font: { bold: true, sz: BASE_SZ } }), cell('', {}),
  ]);
  const accountLine = (acc: BankAccountInfo | null | undefined) => acc
    ? [`예금주: ${acc.account_holder}`, `은행명: ${acc.bank_name}`, `계좌번호: ${acc.account_number}`]
    : ['등록된 계좌 없음'];
  const usdLines = accountLine(usdBankAccount);
  const krwLines = accountLine(krwBankAccount);
  const maxLines = Math.max(usdLines.length, krwLines.length);
  for (let i = 0; i < maxLines; i++) {
    aoa.push([
      cell(usdLines[i] || '', { font: { sz: BASE_SZ } }), cell('', {}), cell('', {}), cell('', {}), cell('', {}),
      cell(krwLines[i] || '', { font: { sz: BASE_SZ } }), cell('', {}),
    ]);
  }
  aoa.push(blank());
  aoa.push(blank());
  aoa.push([cell('', {}), cell('', {}), cell('', {}), cell('', {}), cell('', {}), cell('Very truly yours,', { font: { sz: BASE_SZ } }), cell('', {})]);
  aoa.push([cell('', {}), cell('', {}), cell('', {}), cell('', {}), cell('', {}), cell(companyInfo.name, { font: { sz: BASE_SZ, bold: true } }), cell('', {})]);

  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  worksheet['!cols'] = [{ wch: 10 }, { wch: 22 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 18 }, { wch: 18 }];
  worksheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: COLS - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: COLS - 1 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: COLS - 1 } },
    { s: { r: tableHeaderRow, c: 1 }, e: { r: tableHeaderRow, c: 4 } },
    ...data.ships.map((_, idx) => ({ s: { r: tableHeaderRow + 1 + idx, c: 1 }, e: { r: tableHeaderRow + 1 + idx, c: 4 } })),
  ];
  return worksheet;
}

function buildDetailSheet(data: ManagementFeeInvoiceData): XLSX.WorkSheet {
  const shipCount = data.ships.length;
  const aoa: ReturnType<typeof cell>[][] = [];
  const colCount = 2 + shipCount + 1; // 그룹 + 항목명 + 선박별 + TOTAL

  aoa.push([cell('비용 상세 내역서', { font: { bold: true, sz: 12 }, alignment: { horizontal: 'center' } }), ...Array.from({ length: colCount - 1 }, () => cell('', {}))]);
  aoa.push([
    cell('', {}), cell('', {}),
    ...data.ships.map(s => cell(s.ship_name, {
      font: { bold: true, sz: BASE_SZ, color: { rgb: HEADER.fg } },
      fill: { fgColor: { rgb: HEADER.bg } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: border({ thickTop: true, thickBottom: true }),
    })),
    cell('TOTAL', {
      font: { bold: true, sz: BASE_SZ, color: { rgb: RESULT_HEADER.fg } },
      fill: { fgColor: { rgb: RESULT_HEADER.bg } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: border({ thickTop: true, thickBottom: true }),
    }),
  ]);

  for (const group of DETAIL_GROUPS) {
    group.rows.forEach((row, ri) => {
      const values = data.ships.map(s => row.getValue(s));
      const total = values.reduce((s, v) => s + v, 0);
      aoa.push([
        cell(ri === 0 ? group.label : '', { font: { bold: true, sz: BASE_SZ }, border: border() }),
        cell(row.label, { font: { sz: BASE_SZ }, border: border() }),
        ...values.map(v => cell(v, { numFmt: '#,##0.00', alignment: { horizontal: 'right' }, font: { sz: BASE_SZ }, border: border() })),
        cell(total, { numFmt: '#,##0.00', alignment: { horizontal: 'right' }, font: { sz: BASE_SZ, bold: true }, fill: { fgColor: { rgb: TOTAL_ROW_BG } }, border: border() }),
      ]);
    });
  }

  aoa.push([
    cell('외화 총액', { font: { bold: true, sz: BASE_SZ }, fill: { fgColor: { rgb: RESULT_HEADER.bg } }, border: border({ thickTop: true }) }),
    cell('', { fill: { fgColor: { rgb: RESULT_HEADER.bg } }, border: border({ thickTop: true }) }),
    ...data.ships.map(s => cell(s.usd_total, { numFmt: '#,##0.00', alignment: { horizontal: 'right' }, font: { bold: true, sz: BASE_SZ }, fill: { fgColor: { rgb: RESULT_HEADER.bg } }, border: border({ thickTop: true }) })),
    cell(data.grand_total_usd, { numFmt: '#,##0.00', alignment: { horizontal: 'right' }, font: { bold: true, sz: BASE_SZ }, fill: { fgColor: { rgb: RESULT_HEADER.bg } }, border: border({ thickTop: true }) }),
  ]);
  aoa.push([
    cell('원화 총액', { font: { bold: true, sz: BASE_SZ }, fill: { fgColor: { rgb: RESULT_HEADER.bg } }, border: border() }),
    cell('', { fill: { fgColor: { rgb: RESULT_HEADER.bg } }, border: border() }),
    ...data.ships.map(s => cell(s.krw_total, { numFmt: '#,##0', alignment: { horizontal: 'right' }, font: { bold: true, sz: BASE_SZ }, fill: { fgColor: { rgb: RESULT_HEADER.bg } }, border: border() })),
    cell(data.grand_total_krw, { numFmt: '#,##0', alignment: { horizontal: 'right' }, font: { bold: true, sz: BASE_SZ }, fill: { fgColor: { rgb: RESULT_HEADER.bg } }, border: border() }),
  ]);

  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  worksheet['!cols'] = [{ wch: 12 }, { wch: 26 }, ...data.ships.map(() => ({ wch: 13 })), { wch: 14 }];
  worksheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } }];
  return worksheet;
}

function buildActualCostDetailSheet(data: ManagementFeeInvoiceData, actualCostEntriesByShip: Record<string, ManagementFeeLedgerActualCostEntry[]>): XLSX.WorkSheet {
  const headerLabels = ['선박', '비용', '화폐단위', '개별 금액', '개수/인원', '금액(USD)', '비고'];
  const aoa: ReturnType<typeof cell>[][] = [];
  aoa.push([cell('승/하선 비용내역서', { font: { bold: true, sz: 12 }, alignment: { horizontal: 'center' } }), ...Array.from({ length: headerLabels.length - 1 }, () => cell('', {}))]);
  aoa.push(headerLabels.map(label => cell(label, {
    font: { bold: true, sz: BASE_SZ, color: { rgb: HEADER.fg } },
    fill: { fgColor: { rgb: HEADER.bg } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: border({ thickTop: true, thickBottom: true }),
  })));

  for (const ship of data.ships) {
    const entries = actualCostEntriesByShip[ship.ship_id] || [];
    if (entries.length === 0) continue;
    entries.forEach(e => {
      aoa.push([
        cell(ship.ship_name, { font: { sz: BASE_SZ }, border: border() }),
        cell(e.fee_item_name, { font: { sz: BASE_SZ }, border: border() }),
        cell(e.currency, { alignment: { horizontal: 'center' }, font: { sz: BASE_SZ }, border: border() }),
        cell(e.unit_price ?? '', { numFmt: '#,##0', alignment: { horizontal: 'right' }, font: { sz: BASE_SZ }, border: border() }),
        cell(e.quantity ?? '', { alignment: { horizontal: 'center' }, font: { sz: BASE_SZ }, border: border() }),
        cell(e.amount_usd, { numFmt: '#,##0.00', alignment: { horizontal: 'right' }, font: { sz: BASE_SZ, bold: true }, border: border() }),
        cell(e.remark || '', { font: { sz: BASE_SZ }, border: border() }),
      ]);
    });
  }

  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  worksheet['!cols'] = autoColWidths(aoa, headerLabels.length, { min: 10, max: 30, startRow: 1 });
  worksheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: headerLabels.length - 1 } }];
  return worksheet;
}

export function buildManagementFeeInvoiceWorkbook(input: ManagementFeeInvoiceExportInput): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, buildCoverSheet(input), '표지');
  XLSX.utils.book_append_sheet(workbook, buildDetailSheet(input.data), '비용상세내역');
  XLSX.utils.book_append_sheet(workbook, buildActualCostDetailSheet(input.data, input.actualCostEntriesByShip), '승하선 비용상세');
  return workbook;
}

export async function exportManagementFeeInvoiceToExcel(input: ManagementFeeInvoiceExportInput): Promise<void> {
  const workbook = buildManagementFeeInvoiceWorkbook(input);
  const rawBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  const buffer = await applyPrintFit(rawBuffer, workbook.SheetNames.length);
  const blob = new Blob([buffer as unknown as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${input.data.owner_name}_${input.data.year_month}_관리비청구서.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
