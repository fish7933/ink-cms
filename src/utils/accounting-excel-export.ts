import * as XLSX from 'xlsx-js-style';
import JSZip from 'jszip';
import { supabase } from '@/lib/supabase';
import { getBankAccounts } from '@/services/accounting-bank-account.service';
import { getCashRegisters } from '@/services/accounting-cash-register.service';
import { getCompanyInfo } from '@/services/company-info.service';

const NUM_FMT = '#,##0';

interface SaveFilePickerWindow extends Window {
  showSaveFilePicker?: (options: {
    suggestedName?: string;
    types?: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<{
    createWritable: () => Promise<{ write: (data: BlobPart) => Promise<void>; close: () => Promise<void> }>;
  }>;
}

// 화면에서 인쇄해도 안전하도록 옅은 색만 쓰고 글자 크기를 통일한다.
const THIN = 'CCCCCC';
const HEADER_BG = 'E8ECF3';
const SUBTOTAL_BG = 'F2F2F2';
const OPENING_BG = 'FAFAFA';
const FONT_SZ = 9;
const HEADER_FONT_SZ = 9;

function cell(v: string | number, style: Record<string, unknown> = {}) {
  const base = { font: { sz: FONT_SZ, ...(style.font as Record<string, unknown> || {}) } };
  return { v, t: typeof v === 'number' ? 'n' : 's', s: { ...base, ...style, font: { ...base.font, ...(style.font as Record<string, unknown> || {}) } } };
}

const border = {
  top: { style: 'thin', color: { rgb: THIN } },
  bottom: { style: 'thin', color: { rgb: THIN } },
  left: { style: 'thin', color: { rgb: THIN } },
  right: { style: 'thin', color: { rgb: THIN } },
};

// 우리 회사 경리 부서가 실제로 쓰던 엑셀(계좌별 시트, no./거래일시/입금/출금/거래후잔액/
// 은행기재/상대거래처/구분/선사/내용 열)과 같은 모양으로 계좌별 거래 원장을 만든다.
// 시트별로 세부 열이 조금씩 달랐던 원본과 달리(출금1/출금2, 입금1/입금2, 증빙종류 등)
// 우리 시스템 데이터로 채울 수 있는 공통 열만 모아 5개 계좌를 동일한 구조로 통일했다.
const COLUMN_LABELS = ['no.', '거래일시', '입금', '출금', '거래후잔액', '은행기재', '상대거래처', '구분', '선사', '내용'];
const COL_WIDTHS = [5, 12, 13, 13, 15, 18, 18, 12, 8, 30];

export interface ExportDateRange {
  start: string | null; // null이면 계좌 개설일부터
  end: string | null;   // null이면 끝까지
  label: string;         // 파일명에 들어갈 기간 표시(예: "2026-08", "2026", "2026-08-12", "전체기간")
}

interface LedgerAccount {
  name: string;
  accountNumber: string | null;
  openingBalance: number;
}

interface RawTxn {
  transaction_date: string;
  transaction_type: 'income' | 'expense';
  amount: number;
  counterparty: string | null;
  description: string | null;
  category_id: string | null;
  bank_account_id: string | null;
  cash_register_id: string | null;
}

async function fetchAllTransactions(): Promise<RawTxn[]> {
  const PAGE_SIZE = 1000;
  const rows: RawTxn[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('accounting_cash_transactions')
      .select('transaction_date, transaction_type, amount, counterparty, description, category_id, bank_account_id, cash_register_id')
      .order('transaction_date', { ascending: true })
      .order('created_at', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}

function emptyRow(colCount: number, style: Record<string, unknown> = {}) {
  return Array.from({ length: colCount }, () => cell('', style));
}

function buildAccountSheet(companyName: string, account: LedgerAccount, allTxns: RawTxn[], categoryNameById: Map<string, string>, range: ExportDateRange): XLSX.WorkSheet {
  const colCount = COLUMN_LABELS.length;
  const aoa: ReturnType<typeof cell>[][] = [];

  aoa.push([cell(`예금주명 : ${companyName}`, { font: { bold: true, sz: 11 } }), ...emptyRow(colCount - 1)]);
  aoa.push([cell('계좌번호 : ', {}), cell(account.accountNumber || '', {}), ...emptyRow(colCount - 2)]);
  aoa.push([cell(`조회 기간 : ${range.label}`, { font: { italic: true, color: { rgb: '666666' } } }), ...emptyRow(colCount - 1)]);
  aoa.push(COLUMN_LABELS.map(label => cell(label, { font: { bold: true, sz: HEADER_FONT_SZ }, fill: { fgColor: { rgb: HEADER_BG } }, border, alignment: { horizontal: 'center' } })));

  // range.start 이전 거래로 이월잔액을 먼저 계산하고, 실제로 표에 나열하는 건 범위 안의 거래만 —
  // "일별/월별/연도별 조회 중인 내역만 다운로드"가 되도록 목록은 그 기간으로 좁히되, 잔액은
  // 처음부터 누적한 진짜 값이 이어지게 한다.
  const before = range.start ? allTxns.filter(t => t.transaction_date < range.start!) : [];
  const inRange = allTxns.filter(t => (!range.start || t.transaction_date >= range.start) && (!range.end || t.transaction_date <= range.end));

  let balance = account.openingBalance;
  for (const t of before) balance += t.transaction_type === 'income' ? Number(t.amount) : -Number(t.amount);

  let no = 0;
  aoa.push([
    cell(no, { border, alignment: { horizontal: 'right' }, fill: { fgColor: { rgb: OPENING_BG } } }),
    cell('전일이월', { border, fill: { fgColor: { rgb: OPENING_BG } } }),
    cell('', { border, fill: { fgColor: { rgb: OPENING_BG } } }), cell('', { border, fill: { fgColor: { rgb: OPENING_BG } } }),
    cell(balance, { border, numFmt: NUM_FMT, alignment: { horizontal: 'right' }, font: { bold: true }, fill: { fgColor: { rgb: OPENING_BG } } }),
    ...emptyRow(colCount - 5, { border, fill: { fgColor: { rgb: OPENING_BG } } }),
  ]);

  // 월이 바뀔 때마다 그 달의 입금/출금 합계와 월말 잔액을 소계 행으로 끊어 보여준다(기존
  // 경리부서 양식처럼 계좌별 거래내역표 하단에 늘 "합계"가 있던 것과 같은 취지).
  let currentMonth: string | null = null;
  let monthIncome = 0;
  let monthExpense = 0;

  const flushMonthSubtotal = () => {
    if (currentMonth === null) return;
    const label = `${currentMonth.slice(0, 4)}년 ${Number(currentMonth.slice(5, 7))}월 소계`;
    aoa.push([
      cell('', { border, fill: { fgColor: { rgb: SUBTOTAL_BG } } }),
      cell(label, { border, font: { bold: true }, fill: { fgColor: { rgb: SUBTOTAL_BG } } }),
      cell(monthIncome, { border, numFmt: NUM_FMT, alignment: { horizontal: 'right' }, font: { bold: true }, fill: { fgColor: { rgb: SUBTOTAL_BG } } }),
      cell(monthExpense, { border, numFmt: NUM_FMT, alignment: { horizontal: 'right' }, font: { bold: true }, fill: { fgColor: { rgb: SUBTOTAL_BG } } }),
      cell(balance, { border, numFmt: NUM_FMT, alignment: { horizontal: 'right' }, font: { bold: true }, fill: { fgColor: { rgb: SUBTOTAL_BG } } }),
      ...emptyRow(colCount - 5, { border, fill: { fgColor: { rgb: SUBTOTAL_BG } } }),
    ]);
    monthIncome = 0;
    monthExpense = 0;
  };

  for (const t of inRange) {
    const ym = t.transaction_date.slice(0, 7);
    if (currentMonth !== null && ym !== currentMonth) flushMonthSubtotal();
    currentMonth = ym;

    const amount = Number(t.amount);
    balance += t.transaction_type === 'income' ? amount : -amount;
    no += 1;
    if (t.transaction_type === 'income') monthIncome += amount; else monthExpense += amount;
    const categoryName = t.category_id ? categoryNameById.get(t.category_id) || '' : '';
    aoa.push([
      cell(no, { border, alignment: { horizontal: 'right' } }),
      cell(t.transaction_date, { border }),
      cell(t.transaction_type === 'income' ? amount : '', { border, numFmt: NUM_FMT, alignment: { horizontal: 'right' } }),
      cell(t.transaction_type === 'expense' ? amount : '', { border, numFmt: NUM_FMT, alignment: { horizontal: 'right' } }),
      cell(balance, { border, numFmt: NUM_FMT, alignment: { horizontal: 'right' } }),
      cell(t.counterparty || '', { border }),
      cell(t.counterparty || '', { border }),
      cell(categoryName, { border }),
      cell('', { border }),
      cell(t.description || '', { border }),
    ]);
  }
  flushMonthSubtotal();

  const sheet = XLSX.utils.aoa_to_sheet(aoa.map(row => row.map(c => c.v)));
  sheet['!cols'] = COL_WIDTHS.map(w => ({ wch: w }));
  // 스타일(테두리/배경/정렬)을 aoa_to_sheet가 버리므로 셀별로 다시 입혀준다.
  aoa.forEach((row, r) => row.forEach((c, cIdx) => {
    const addr = XLSX.utils.encode_cell({ r, c: cIdx });
    if (sheet[addr]) sheet[addr].s = c.s;
  }));

  return sheet;
}

// xlsx-js-style(SheetJS 커뮤니티 빌드)은 인쇄 배율/방향 쓰기를 지원하지 않아 워크북 생성 API
// (`!pageSetup`/`!margins`)만으로는 적용이 안 된다(crew-payroll-export.ts의 applyPrintFit와
// 동일한 이유) — 만들어진 xlsx는 zip이므로 시트별 XML에 표준 OOXML 순서(mergeCells →
// pageMargins → pageSetup → ignoredErrors)를 지켜 직접 끼워 넣는다. 계좌 원장은 열이 10개라
// 전부 가로로 눕히고 폭만 한 페이지에 맞춘다(세로는 거래가 많으면 여러 페이지 허용).
async function applyLandscapeFitWidth(buffer: ArrayBuffer, sheetCount: number): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(buffer);
  for (let i = 1; i <= sheetCount; i++) {
    const path = `xl/worksheets/sheet${i}.xml`;
    const file = zip.file(path);
    if (!file) continue;
    let xml = await file.async('string');
    if (!xml.includes('<sheetPr')) {
      xml = xml.replace(/(<worksheet[^>]*>)/, `$1<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>`);
    }
    const pageSetupTag = `<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>`;
    if (xml.includes('<pageMargins')) {
      xml = xml.replace(/(<pageMargins[^/]*\/>)/, `$1${pageSetupTag}`);
    } else {
      const defaultMargins = `<pageMargins left="0.3" right="0.3" top="0.4" bottom="0.4" header="0.2" footer="0.2"/>`;
      xml = xml.includes('<ignoredErrors')
        ? xml.replace('<ignoredErrors', `${defaultMargins}${pageSetupTag}<ignoredErrors`)
        : xml.replace('</worksheet>', `${defaultMargins}${pageSetupTag}</worksheet>`);
    }
    zip.file(path, xml);
  }
  return zip.generateAsync({ type: 'uint8array' });
}

async function writeWorkbook(workbook: XLSX.WorkBook, fileName: string): Promise<void> {
  const rawBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  const buffer = await applyLandscapeFitWidth(rawBuffer, workbook.SheetNames.length);
  const blob = new Blob([buffer as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  const picker = (window as SaveFilePickerWindow).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker({
        suggestedName: fileName,
        types: [{ description: 'Excel Workbook', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export interface LedgerSheetPreview {
  sheetName: string;
  html: string;
}

export interface LedgerWorkbookResult {
  workbook: XLSX.WorkBook;
  fileName: string;
  previews: LedgerSheetPreview[];
}

// 계좌별(통장 전부 + 현금 시재) 거래를 시트로 나눠 워크북을 만든다 — 다운로드와 미리보기 양쪽이
// 이 함수 하나로 같은 데이터를 쓴다. range로 지정한 기간(일/월/연도/전체)의 거래만 목록에
// 나열되고, 잔액은 계좌 개설일부터 진짜로 누적된 값이 이어진다.
export async function buildAccountingLedgerWorkbook(range: ExportDateRange): Promise<LedgerWorkbookResult> {
  const [company, bankAccounts, cashRegisters, allTxns, { data: categories }] = await Promise.all([
    getCompanyInfo(),
    getBankAccounts(),
    getCashRegisters(),
    fetchAllTransactions(),
    supabase.from('accounting_categories').select('id, name'),
  ]);
  const categoryNameById = new Map((categories || []).map(c => [c.id as string, c.name as string]));
  const companyName = company?.name || '';

  const workbook = XLSX.utils.book_new();
  const previews: LedgerSheetPreview[] = [];

  const addSheet = (name: string, accountNumber: string | null, openingBalance: number, txns: RawTxn[]) => {
    const sheetName = name.slice(0, 31);
    const sheet = buildAccountSheet(companyName, { name, accountNumber, openingBalance }, txns, categoryNameById, range);
    XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
    previews.push({ sheetName, html: XLSX.utils.sheet_to_html(sheet, { editable: false }) });
  };

  for (const a of bankAccounts) {
    addSheet(a.account_name, a.account_number, Number(a.opening_balance), allTxns.filter(t => t.bank_account_id === a.id));
  }
  for (const r of cashRegisters) {
    addSheet(r.name, null, Number(r.opening_balance), allTxns.filter(t => t.cash_register_id === r.id));
  }

  return { workbook, fileName: `${companyName || '경리'}_거래내역_${range.label}.xlsx`, previews };
}

// 계좌별(통장 전부 + 현금 시재) 거래를 시트로 나눠 하나의 엑셀로 내보낸다 — 경리 부서가 쓰던
// 원본 양식과 같은 구조라 그대로 이어서 쓸 수 있다.
export async function exportAccountingLedgerWorkbook(range: ExportDateRange): Promise<void> {
  const { workbook, fileName } = await buildAccountingLedgerWorkbook(range);
  await writeWorkbook(workbook, fileName);
}
