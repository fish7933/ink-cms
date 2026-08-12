import * as XLSX from 'xlsx-js-style';
import { supabase } from '@/lib/supabase';
import { getBankAccounts } from '@/services/accounting-bank-account.service';
import { getCashRegisters } from '@/services/accounting-cash-register.service';
import { getCompanyInfo } from '@/services/company-info.service';

interface SaveFilePickerWindow extends Window {
  showSaveFilePicker?: (options: {
    suggestedName?: string;
    types?: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<{
    createWritable: () => Promise<{ write: (data: BlobPart) => Promise<void>; close: () => Promise<void> }>;
  }>;
}

const THIN = 'CCCCCC';
const HEADER_BG = 'F5F5F5';

function cell(v: string | number, style: Record<string, unknown> = {}) {
  return { v, t: typeof v === 'number' ? 'n' : 's', s: style };
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

interface LedgerAccount {
  name: string;
  accountNumber: string | null;
  openingBalance: number;
  bankAccountId?: string;
  cashRegisterId?: string;
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

function buildAccountSheet(companyName: string, account: LedgerAccount, txns: RawTxn[], categoryNameById: Map<string, string>): XLSX.WorkSheet {
  const colCount = COLUMN_LABELS.length;
  const aoa: ReturnType<typeof cell>[][] = [];

  aoa.push([cell(`예금주명 : ${companyName}`, { font: { bold: true } }), ...Array.from({ length: colCount - 1 }, () => cell('', {}))]);
  aoa.push([cell('계좌번호 : ', {}), cell(account.accountNumber || '', {}), ...Array.from({ length: colCount - 2 }, () => cell('', {}))]);
  aoa.push(COLUMN_LABELS.map(label => cell(label, { font: { bold: true }, fill: { fgColor: { rgb: HEADER_BG } }, border, alignment: { horizontal: 'center' } })));

  let balance = account.openingBalance;
  let no = 0;
  aoa.push([
    cell(no, { border, alignment: { horizontal: 'right' } }),
    cell('전일이월', { border }),
    cell('', { border }), cell('', { border }),
    cell(balance, { border, alignment: { horizontal: 'right' } }),
    cell('', { border }), cell('', { border }), cell('', { border }), cell('', { border }), cell('', { border }),
  ]);

  for (const t of txns) {
    const amount = Number(t.amount);
    balance += t.transaction_type === 'income' ? amount : -amount;
    no += 1;
    const categoryName = t.category_id ? categoryNameById.get(t.category_id) || '' : '';
    aoa.push([
      cell(no, { border, alignment: { horizontal: 'right' } }),
      cell(t.transaction_date, { border }),
      cell(t.transaction_type === 'income' ? amount : '', { border, alignment: { horizontal: 'right' } }),
      cell(t.transaction_type === 'expense' ? amount : '', { border, alignment: { horizontal: 'right' } }),
      cell(balance, { border, alignment: { horizontal: 'right' } }),
      cell(t.counterparty || '', { border }),
      cell(t.counterparty || '', { border }),
      cell(categoryName, { border }),
      cell('', { border }),
      cell(t.description || '', { border }),
    ]);
  }

  const sheet = XLSX.utils.aoa_to_sheet(aoa.map(row => row.map(c => c.v)));
  sheet['!cols'] = COL_WIDTHS.map(w => ({ wch: w }));
  // 스타일(테두리/배경/정렬)을 aoa_to_sheet가 버리므로 셀별로 다시 입혀준다.
  aoa.forEach((row, r) => row.forEach((c, cIdx) => {
    const addr = XLSX.utils.encode_cell({ r, c: cIdx });
    if (sheet[addr]) sheet[addr].s = c.s;
  }));
  return sheet;
}

async function writeWorkbook(workbook: XLSX.WorkBook, fileName: string): Promise<void> {
  const picker = (window as SaveFilePickerWindow).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker({
        suggestedName: fileName,
        types: [{ description: 'Excel Workbook', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }],
      });
      const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const writable = await handle.createWritable();
      await writable.write(buffer);
      await writable.close();
      return;
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return;
    }
  }
  XLSX.writeFile(workbook, fileName);
}

// 계좌별(통장 전부 + 현금 시재) 거래 전체를 시트로 나눠 하나의 엑셀로 내보낸다 —
// 경리 부서가 쓰던 원본 양식과 같은 구조라 그대로 이어서 쓸 수 있다.
export async function exportAccountingLedgerWorkbook(): Promise<void> {
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

  for (const a of bankAccounts) {
    const account: LedgerAccount = { name: a.account_name, accountNumber: a.account_number, openingBalance: Number(a.opening_balance), bankAccountId: a.id };
    const txns = allTxns.filter(t => t.bank_account_id === a.id);
    const sheet = buildAccountSheet(companyName, account, txns, categoryNameById);
    XLSX.utils.book_append_sheet(workbook, sheet, a.account_name.slice(0, 31));
  }
  for (const r of cashRegisters) {
    const account: LedgerAccount = { name: r.name, accountNumber: null, openingBalance: Number(r.opening_balance), cashRegisterId: r.id };
    const txns = allTxns.filter(t => t.cash_register_id === r.id);
    const sheet = buildAccountSheet(companyName, account, txns, categoryNameById);
    XLSX.utils.book_append_sheet(workbook, sheet, r.name.slice(0, 31));
  }

  const today = new Date();
  const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
  await writeWorkbook(workbook, `${companyName || '경리'}_거래내역_${dateStr}.xlsx`);
}
