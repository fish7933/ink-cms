import * as XLSX from 'xlsx-js-style';
import type { CrewPayrollLedgerData, CrewPayslipWithDetails } from '@/types/crew-payroll';
import type { TemplateMatrix } from '@/lib/salary-template-matrix';

// 직원 급여대장(employee-payroll-ledger-export.ts)과 같은 톤 — 옅은 회색 배경 + 공제 항목만
// 빨간 글자로 구분.
export const HEADER = { bg: 'F5F5F5', fg: '333333' };
export const DEDUCTION_HEADER = { bg: 'F5F5F5', fg: 'A33333' };
export const RESULT_HEADER = { bg: 'EFEFEF', fg: '222222' };
export const TOTAL_ROW_BG = 'F7F7F7';
const THIN = 'CCCCCC';
const THICK = '888888';
export const BASE_SZ = 9;

export const border = (opts: { thickTop?: boolean; thickBottom?: boolean } = {}) => ({
  top: { style: opts.thickTop ? 'medium' : 'thin', color: { rgb: opts.thickTop ? THICK : THIN } },
  bottom: { style: opts.thickBottom ? 'medium' : 'thin', color: { rgb: opts.thickBottom ? THICK : THIN } },
  left: { style: 'thin', color: { rgb: THIN } },
  right: { style: 'thin', color: { rgb: THIN } },
});

export function cell(v: string | number, style: Record<string, unknown>) {
  return { v, t: typeof v === 'number' ? 'n' : 's', s: style };
}

export const fmtMD = (d: string) => d?.slice(5).replace('-', '/') || '';

// 적용된 급여 템플릿의 직급/등급별 전체 항목(SalaryTemplateMatrixTable과 같은 데이터)을
// 급여대장 아래에 참고표로 붙인다 — 급여명/청구서 엑셀 양쪽에서 재사용.
export function appendTemplateMatrixRows(aoa: ReturnType<typeof cell>[][], templateName: string | undefined, matrix: TemplateMatrix | undefined) {
  if (!templateName) return;
  aoa.push([cell('', {})]);
  aoa.push([cell(`Salary Template Applied: ${templateName}`, { font: { bold: true, sz: BASE_SZ, color: { rgb: '555555' } } })]);
  if (!matrix || matrix.rows.length === 0) return;

  aoa.push([
    cell('Rank', { font: { bold: true, sz: BASE_SZ, color: { rgb: HEADER.fg } }, fill: { fgColor: { rgb: HEADER.bg } }, border: border({ thickTop: true, thickBottom: true }) }),
    ...matrix.columns.map(c => cell(c.name, {
      font: { bold: true, sz: BASE_SZ, color: { rgb: c.is_deduction ? DEDUCTION_HEADER.fg : HEADER.fg } },
      fill: { fgColor: { rgb: c.is_deduction ? DEDUCTION_HEADER.bg : HEADER.bg } },
      alignment: { horizontal: 'right' },
      border: border({ thickTop: true, thickBottom: true }),
    })),
    cell('Total (TW)', { font: { bold: true, sz: BASE_SZ, color: { rgb: RESULT_HEADER.fg } }, fill: { fgColor: { rgb: RESULT_HEADER.bg } }, alignment: { horizontal: 'right' }, border: border({ thickTop: true, thickBottom: true }) }),
    cell('Net (AW)', { font: { bold: true, sz: BASE_SZ, color: { rgb: RESULT_HEADER.fg } }, fill: { fgColor: { rgb: RESULT_HEADER.bg } }, alignment: { horizontal: 'right' }, border: border({ thickTop: true, thickBottom: true }) }),
  ]);
  matrix.rows.forEach(r => {
    aoa.push([
      cell(r.grade ? `${r.rank_code} (${r.grade})` : r.rank_code, { font: { sz: BASE_SZ, bold: true }, border: border() }),
      ...r.amounts.map(a => cell(a ?? '-', { numFmt: '#,##0', alignment: { horizontal: 'right' }, font: { sz: BASE_SZ }, border: border() })),
      cell(r.total_earning, { numFmt: '#,##0', alignment: { horizontal: 'right' }, font: { sz: BASE_SZ, bold: true }, fill: { fgColor: { rgb: TOTAL_ROW_BG } }, border: border() }),
      cell(r.net_earning, { numFmt: '#,##0', alignment: { horizontal: 'right' }, font: { sz: BASE_SZ, bold: true }, fill: { fgColor: { rgb: RESULT_HEADER.bg } }, border: border() }),
    ]);
  });
}

// 급여대장 — 선박에 승선한 선원 전원을 한 표에 모으되, 급여 구성항목(BW/OT/OA/LP 등)과
// 계약별 수당을 "기본급" 한 칸으로 뭉치지 않고 항목명별 열로 모두 펼쳐 보여준다.
function buildLedgerWorksheet(ledger: CrewPayrollLedgerData): XLSX.WorkSheet {
  const { period, ship_name, owner_name, fleet_name, template_name, allowance_columns, deduction_columns, rows } = ledger;
  const headerLabels = ['Rank', 'Grade', 'Name', 'Pay Period', 'Days', ...allowance_columns, 'Total Earnings', ...deduction_columns, 'Total Deductions', 'Net Pay'];
  const colCount = headerLabels.length;
  const grossCol = 4 + allowance_columns.length; // 0-indexed position

  const aoa: ReturnType<typeof cell>[][] = [];

  const titleParts = [owner_name, fleet_name, ship_name].filter(Boolean).join(' > ');
  aoa.push([
    cell(`${titleParts}  ${period.year_month} Payroll Ledger`, { font: { bold: true, sz: 12 }, alignment: { horizontal: 'center' } }),
    ...Array.from({ length: colCount - 1 }, () => cell('', {})),
  ]);
  aoa.push(Array.from({ length: colCount }, () => cell('', {})));

  aoa.push(headerLabels.map((label, i) => {
    const isDeduction = i > grossCol && label !== 'Total Deductions' && label !== 'Net Pay';
    const isResult = label === 'Total Deductions' || label === 'Net Pay' || label === 'Total Earnings';
    const colors = isDeduction ? DEDUCTION_HEADER : isResult ? RESULT_HEADER : HEADER;
    return cell(label, {
      font: { bold: true, sz: BASE_SZ, color: { rgb: colors.fg } },
      fill: { fgColor: { rgb: colors.bg } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: border({ thickTop: true, thickBottom: true }),
    });
  }));

  rows.forEach((r, idx) => {
    aoa.push([
      cell(r.rank_code || '-', { alignment: { horizontal: 'center' }, font: { sz: BASE_SZ }, border: border() }),
      cell(r.rank_grade || '-', { alignment: { horizontal: 'center' }, font: { sz: BASE_SZ }, border: border() }),
      cell(r.crew_name, { alignment: { horizontal: 'center' }, font: { sz: BASE_SZ, bold: true }, border: border() }),
      cell(`${fmtMD(r.period_start_date)}~${fmtMD(r.period_end_date)}`, { alignment: { horizontal: 'center' }, font: { sz: BASE_SZ }, border: border() }),
      cell(`${r.days_served}/${r.days_in_month}`, { alignment: { horizontal: 'center' }, font: { sz: BASE_SZ }, border: border() }),
      ...allowance_columns.map(name => cell(r.allowance_by_name[name] || 0, { numFmt: '#,##0', alignment: { horizontal: 'right' }, font: { sz: BASE_SZ }, border: border() })),
      cell(r.gross_amount, { numFmt: '#,##0', alignment: { horizontal: 'right' }, font: { sz: BASE_SZ, bold: true }, fill: { fgColor: { rgb: RESULT_HEADER.bg } }, border: border() }),
      ...deduction_columns.map(name => cell(r.deduction_by_name[name] || 0, { numFmt: '#,##0', alignment: { horizontal: 'right' }, font: { sz: BASE_SZ, color: { rgb: DEDUCTION_HEADER.fg } }, border: border() })),
      cell(r.total_deduction, { numFmt: '#,##0', alignment: { horizontal: 'right' }, font: { sz: BASE_SZ, bold: true, color: { rgb: DEDUCTION_HEADER.fg } }, fill: { fgColor: { rgb: RESULT_HEADER.bg } }, border: border() }),
      cell(r.net_amount, { numFmt: '#,##0', alignment: { horizontal: 'right' }, font: { sz: BASE_SZ, bold: true }, fill: { fgColor: { rgb: RESULT_HEADER.bg } }, border: border({ thickBottom: idx === rows.length - 1 }) }),
    ]);
  });

  const sum = (f: (r: CrewPayrollLedgerData['rows'][number]) => number) => rows.reduce((s, r) => s + f(r), 0);
  aoa.push([
    cell(`Total (${rows.length} crew)`, { font: { bold: true, sz: BASE_SZ }, fill: { fgColor: { rgb: TOTAL_ROW_BG } }, border: border({ thickTop: true }) }),
    cell('', { fill: { fgColor: { rgb: TOTAL_ROW_BG } }, border: border({ thickTop: true }) }),
    cell('', { fill: { fgColor: { rgb: TOTAL_ROW_BG } }, border: border({ thickTop: true }) }),
    cell('', { fill: { fgColor: { rgb: TOTAL_ROW_BG } }, border: border({ thickTop: true }) }),
    cell('', { fill: { fgColor: { rgb: TOTAL_ROW_BG } }, border: border({ thickTop: true }) }),
    ...allowance_columns.map(name => cell(sum(r => r.allowance_by_name[name] || 0), { numFmt: '#,##0', alignment: { horizontal: 'right' }, font: { bold: true, sz: BASE_SZ }, fill: { fgColor: { rgb: TOTAL_ROW_BG } }, border: border({ thickTop: true }) })),
    cell(sum(r => r.gross_amount), { numFmt: '#,##0', alignment: { horizontal: 'right' }, font: { bold: true, sz: BASE_SZ }, fill: { fgColor: { rgb: TOTAL_ROW_BG } }, border: border({ thickTop: true }) }),
    ...deduction_columns.map(name => cell(sum(r => r.deduction_by_name[name] || 0), { numFmt: '#,##0', alignment: { horizontal: 'right' }, font: { bold: true, sz: BASE_SZ }, fill: { fgColor: { rgb: TOTAL_ROW_BG } }, border: border({ thickTop: true }) })),
    cell(sum(r => r.total_deduction), { numFmt: '#,##0', alignment: { horizontal: 'right' }, font: { bold: true, sz: BASE_SZ }, fill: { fgColor: { rgb: TOTAL_ROW_BG } }, border: border({ thickTop: true }) }),
    cell(sum(r => r.net_amount), { numFmt: '#,##0', alignment: { horizontal: 'right' }, font: { bold: true, sz: BASE_SZ }, fill: { fgColor: { rgb: TOTAL_ROW_BG } }, border: border({ thickTop: true }) }),
  ]);

  appendTemplateMatrixRows(aoa, template_name, ledger.template_matrix);

  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  worksheet['!cols'] = [
    { wch: 14 }, { wch: 8 }, { wch: 8 }, { wch: 13 }, { wch: 10 },
    ...allowance_columns.map(() => ({ wch: 11 })),
    { wch: 12 },
    ...deduction_columns.map(() => ({ wch: 11 })),
    { wch: 12 }, { wch: 13 },
  ];
  worksheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } }];
  return worksheet;
}

// 선원 개인 급여명세서 — 지급/공제 내역과 실지급액, 맨 아래 서명란까지 포함한 시트 하나.
function buildPayslipWorksheet(payslip: CrewPayslipWithDetails, shipName: string): XLSX.WorkSheet {
  const baseItems = payslip.items.filter(i => i.source === 'template' && i.category === 'earning');
  const allowanceItems = payslip.items.filter(i => i.source === 'contract' && i.category === 'earning');
  const deductionItems = payslip.items.filter(i => i.category === 'deduction');
  const COLS = 4;

  const aoa: ReturnType<typeof cell>[][] = [];
  const titleStyle = { font: { bold: true, sz: 13 }, alignment: { horizontal: 'center' as const } };
  const labelStyle = { font: { sz: BASE_SZ, color: { rgb: '777777' } } };
  const valueStyle = { font: { sz: BASE_SZ, bold: true } };

  aoa.push([cell('CREW PAYSLIP', titleStyle), cell('', {}), cell('', {}), cell('', {})]);
  aoa.push([cell(payslip.period_year_month || payslip.created_at.slice(0, 7), { alignment: { horizontal: 'center' }, font: { sz: BASE_SZ, color: { rgb: '777777' } } }), cell('', {}), cell('', {}), cell('', {})]);
  aoa.push([cell('', {}), cell('', {}), cell('', {}), cell('', {})]);

  aoa.push([cell('Vessel', labelStyle), cell(shipName || '-', valueStyle), cell('Rank', labelStyle), cell(`${payslip.rank_code || payslip.rank_name}${payslip.rank_grade ? `(${payslip.rank_grade})` : ''}`, valueStyle)]);
  aoa.push([cell('Name', labelStyle), cell(payslip.crew_name, valueStyle), cell('Nationality', labelStyle), cell(payslip.nationality || '-', valueStyle)]);
  aoa.push([cell('Pay Period', labelStyle), cell(`${payslip.period_start_date} ~ ${payslip.period_end_date}`, valueStyle), cell('Days Served', labelStyle), cell(`${payslip.days_served} / ${payslip.days_in_month} days`, valueStyle)]);
  aoa.push([cell('', {}), cell('', {}), cell('', {}), cell('', {})]);

  const sectionHeader = (label: string, deduction?: boolean) => [
    cell(label, { font: { bold: true, sz: BASE_SZ, color: { rgb: deduction ? DEDUCTION_HEADER.fg : HEADER.fg } }, fill: { fgColor: { rgb: deduction ? DEDUCTION_HEADER.bg : HEADER.bg } }, border: border({ thickTop: true, thickBottom: true }) }),
    cell('', { fill: { fgColor: { rgb: deduction ? DEDUCTION_HEADER.bg : HEADER.bg } }, border: border({ thickTop: true, thickBottom: true }) }),
    cell('Type', { font: { bold: true, sz: BASE_SZ, color: { rgb: deduction ? DEDUCTION_HEADER.fg : HEADER.fg } }, fill: { fgColor: { rgb: deduction ? DEDUCTION_HEADER.bg : HEADER.bg } }, alignment: { horizontal: 'center' }, border: border({ thickTop: true, thickBottom: true }) }),
    cell('Amount', { font: { bold: true, sz: BASE_SZ, color: { rgb: deduction ? DEDUCTION_HEADER.fg : HEADER.fg } }, fill: { fgColor: { rgb: deduction ? DEDUCTION_HEADER.bg : HEADER.bg } }, alignment: { horizontal: 'right' }, border: border({ thickTop: true, thickBottom: true }) }),
  ];

  aoa.push(sectionHeader('EARNINGS'));
  [...baseItems.map(i => ({ item: i, type: 'Base Pay' })), ...allowanceItems.map(i => ({ item: i, type: 'Allowance' }))].forEach(({ item, type }) => {
    aoa.push([
      cell(item.name + (item.payment_method === 'owner_billed' ? ' (Owner Billed)' : ''), { font: { sz: BASE_SZ }, border: border() }),
      cell('', { border: border() }),
      cell(type, { font: { sz: BASE_SZ }, alignment: { horizontal: 'center' }, border: border() }),
      cell(item.amount, { numFmt: '#,##0', font: { sz: BASE_SZ }, alignment: { horizontal: 'right' }, border: border() }),
    ]);
  });
  aoa.push([
    cell('Total Earnings', { font: { bold: true, sz: BASE_SZ }, fill: { fgColor: { rgb: TOTAL_ROW_BG } }, border: border({ thickTop: true }) }),
    cell('', { fill: { fgColor: { rgb: TOTAL_ROW_BG } }, border: border({ thickTop: true }) }),
    cell('', { fill: { fgColor: { rgb: TOTAL_ROW_BG } }, border: border({ thickTop: true }) }),
    cell(payslip.base_amount + payslip.total_allowance, { numFmt: '#,##0', font: { bold: true, sz: BASE_SZ }, alignment: { horizontal: 'right' }, fill: { fgColor: { rgb: TOTAL_ROW_BG } }, border: border({ thickTop: true }) }),
  ]);
  aoa.push([cell('', {}), cell('', {}), cell('', {}), cell('', {})]);

  aoa.push(sectionHeader('DEDUCTIONS', true));
  if (deductionItems.length === 0) {
    aoa.push([cell('No deduction items.', { font: { sz: BASE_SZ, color: { rgb: '999999' } }, border: border() }), cell('', { border: border() }), cell('', { border: border() }), cell('', { border: border() })]);
  } else {
    deductionItems.forEach(item => {
      aoa.push([
        cell(item.name, { font: { sz: BASE_SZ }, border: border() }),
        cell('', { border: border() }),
        cell('Deduction', { font: { sz: BASE_SZ, color: { rgb: DEDUCTION_HEADER.fg } }, alignment: { horizontal: 'center' }, border: border() }),
        cell(item.amount, { numFmt: '#,##0', font: { sz: BASE_SZ, color: { rgb: DEDUCTION_HEADER.fg } }, alignment: { horizontal: 'right' }, border: border() }),
      ]);
    });
  }
  aoa.push([
    cell('Total Deductions', { font: { bold: true, sz: BASE_SZ, color: { rgb: DEDUCTION_HEADER.fg } }, fill: { fgColor: { rgb: TOTAL_ROW_BG } }, border: border({ thickTop: true }) }),
    cell('', { fill: { fgColor: { rgb: TOTAL_ROW_BG } }, border: border({ thickTop: true }) }),
    cell('', { fill: { fgColor: { rgb: TOTAL_ROW_BG } }, border: border({ thickTop: true }) }),
    cell(payslip.total_deduction, { numFmt: '#,##0', font: { bold: true, sz: BASE_SZ, color: { rgb: DEDUCTION_HEADER.fg } }, alignment: { horizontal: 'right' }, fill: { fgColor: { rgb: TOTAL_ROW_BG } }, border: border({ thickTop: true }) }),
  ]);
  aoa.push([cell('', {}), cell('', {}), cell('', {}), cell('', {})]);

  aoa.push([
    cell('NET PAY', { font: { bold: true, sz: 12 }, fill: { fgColor: { rgb: RESULT_HEADER.bg } }, border: border({ thickTop: true, thickBottom: true }) }),
    cell('', { fill: { fgColor: { rgb: RESULT_HEADER.bg } }, border: border({ thickTop: true, thickBottom: true }) }),
    cell('', { fill: { fgColor: { rgb: RESULT_HEADER.bg } }, border: border({ thickTop: true, thickBottom: true }) }),
    cell(`${payslip.net_amount.toLocaleString('en-US')} ${payslip.currency}`, { font: { bold: true, sz: 12 }, alignment: { horizontal: 'right' }, fill: { fgColor: { rgb: RESULT_HEADER.bg } }, border: border({ thickTop: true, thickBottom: true }) }),
  ]);

  if (payslip.memo) {
    aoa.push([cell('', {}), cell('', {}), cell('', {}), cell('', {})]);
    aoa.push([cell(`Remarks: ${payslip.memo}`, { font: { sz: BASE_SZ, color: { rgb: '555555' } } }), cell('', {}), cell('', {}), cell('', {})]);
  }

  aoa.push([cell('', {}), cell('', {}), cell('', {}), cell('', {})]);
  aoa.push([cell('', {}), cell('', {}), cell('', {}), cell('', {})]);
  aoa.push([
    cell('Crew Signature: _______________________', { font: { sz: BASE_SZ } }),
    cell('', {}),
    cell('Date: _______________', { font: { sz: BASE_SZ } }),
    cell('', {}),
  ]);

  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  worksheet['!cols'] = [{ wch: 22 }, { wch: 18 }, { wch: 14 }, { wch: 16 }];
  worksheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: COLS - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: COLS - 1 } },
  ];
  return worksheet;
}

// 워크북 생성만 담당 — 파일 저장(다운로드 버튼)과 결재 첨부 업로드(지출결의서 상신) 양쪽에서 재사용.
export function buildCrewPayrollLedgerWorkbook(ledger: CrewPayrollLedgerData): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, buildLedgerWorksheet(ledger), `${ledger.period.year_month} Ledger`.slice(0, 31));
  return workbook;
}

// 선박 단위 다운로드용 — 첫 시트는 급여대장, 이어서 승선 중인 선원 각자의 급여명세서를 시트로 추가한다.
export function buildCrewPayrollFullWorkbook(ledger: CrewPayrollLedgerData, payslips: CrewPayslipWithDetails[]): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, buildLedgerWorksheet(ledger), `${ledger.period.year_month} Ledger`.slice(0, 31));
  payslips.forEach((p, idx) => {
    const sheetName = `${idx + 1}_${p.crew_name || 'Crew'}`.replace(/[[\]*/\\?:]/g, '').slice(0, 31);
    XLSX.utils.book_append_sheet(workbook, buildPayslipWorksheet(p, ledger.ship_name), sheetName);
  });
  return workbook;
}

interface SaveFilePickerWindow extends Window {
  showSaveFilePicker?: (options: {
    suggestedName?: string;
    types?: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<{
    createWritable: () => Promise<{ write: (data: BlobPart) => Promise<void>; close: () => Promise<void> }>;
  }>;
}

async function writeWorkbookToFile(workbook: XLSX.WorkBook, fileName: string): Promise<void> {
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

// 급여대장 시트 + 선원별 급여명세서 시트를 하나의 엑셀로 내려받는다.
export async function exportCrewPayrollLedgerToExcel(ledger: CrewPayrollLedgerData, payslips: CrewPayslipWithDetails[]): Promise<void> {
  const workbook = buildCrewPayrollFullWorkbook(ledger, payslips);
  const fileName = `${ledger.ship_name}_${ledger.period.year_month}_Payroll.xlsx`;
  await writeWorkbookToFile(workbook, fileName);
}
