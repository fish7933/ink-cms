import * as XLSX from 'xlsx-js-style';
import type { PayrollLedgerData } from '@/types/employee-salary';

// 스타일 컨벤션은 salary-template-export.ts와 맞춤
const HEADER = { bg: 'DBEAFE', fg: '1E40AF' };
const DEDUCTION_HEADER = { bg: 'FEE2E2', fg: 'B91C1C' };
const RESULT_HEADER = { bg: 'E5E7EB', fg: '374151' };
const TOTAL_ROW_BG = 'F5F5F5';
const THIN = 'CCCCCC';
const THICK = '333333';
const BASE_SZ = 9;

const border = (opts: { thickTop?: boolean; thickBottom?: boolean } = {}) => ({
  top: { style: opts.thickTop ? 'medium' : 'thin', color: { rgb: opts.thickTop ? THICK : THIN } },
  bottom: { style: opts.thickBottom ? 'medium' : 'thin', color: { rgb: opts.thickBottom ? THICK : THIN } },
  left: { style: 'thin', color: { rgb: THIN } },
  right: { style: 'thin', color: { rgb: THIN } },
});

function cell(v: string | number, style: Record<string, unknown>) {
  return { v, t: typeof v === 'number' ? 'n' : 's', s: style };
}

interface SaveFilePickerWindow extends Window {
  showSaveFilePicker?: (options: {
    suggestedName?: string;
    types?: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<{
    createWritable: () => Promise<{ write: (data: BlobPart) => Promise<void>; close: () => Promise<void> }>;
  }>;
}

export async function exportPayrollLedgerToExcel(ledger: PayrollLedgerData, companyName: string): Promise<void> {
  const { period, allowance_columns, deduction_columns, rows } = ledger;
  const headerLabels = ['사번', '이름', '주민등록번호', '입사일', '기본급', ...allowance_columns, '합계', ...deduction_columns, '공제합계', '차인지급액'];
  const colCount = headerLabels.length;
  const grossCol = 4 + allowance_columns.length; // 0-indexed 위치

  const aoa: ReturnType<typeof cell>[][] = [];

  aoa.push([
    cell(`${companyName}  ${period.year_month} 급여대장`, { font: { bold: true, sz: 14 }, alignment: { horizontal: 'center' } }),
    ...Array.from({ length: colCount - 1 }, () => cell('', {})),
  ]);
  aoa.push(Array.from({ length: colCount }, () => cell('', {})));

  aoa.push(headerLabels.map((label, i) => {
    const isDeduction = i > grossCol && label !== '공제합계' && label !== '차인지급액';
    const isResult = label === '공제합계' || label === '차인지급액' || label === '합계';
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
      cell(idx + 1, { alignment: { horizontal: 'center' }, font: { sz: BASE_SZ }, border: border() }),
      cell(r.employee_name, { alignment: { horizontal: 'center' }, font: { sz: BASE_SZ, bold: true }, border: border() }),
      cell(r.resident_registration_number || '-', { alignment: { horizontal: 'center' }, font: { sz: BASE_SZ }, border: border() }),
      cell(r.hire_date || '-', { alignment: { horizontal: 'center' }, font: { sz: BASE_SZ }, border: border() }),
      cell(r.base_amount, { numFmt: '#,##0', alignment: { horizontal: 'right' }, font: { sz: BASE_SZ }, border: border() }),
      ...allowance_columns.map(name => cell(r.allowance_by_name[name] || 0, { numFmt: '#,##0', alignment: { horizontal: 'right' }, font: { sz: BASE_SZ }, border: border() })),
      cell(r.gross_amount, { numFmt: '#,##0', alignment: { horizontal: 'right' }, font: { sz: BASE_SZ, bold: true }, fill: { fgColor: { rgb: RESULT_HEADER.bg } }, border: border() }),
      ...deduction_columns.map(name => cell(r.deduction_by_name[name] || 0, { numFmt: '#,##0', alignment: { horizontal: 'right' }, font: { sz: BASE_SZ, color: { rgb: DEDUCTION_HEADER.fg } }, border: border() })),
      cell(r.total_deduction, { numFmt: '#,##0', alignment: { horizontal: 'right' }, font: { sz: BASE_SZ, bold: true, color: { rgb: DEDUCTION_HEADER.fg } }, fill: { fgColor: { rgb: RESULT_HEADER.bg } }, border: border() }),
      cell(r.net_amount, { numFmt: '#,##0', alignment: { horizontal: 'right' }, font: { sz: BASE_SZ, bold: true }, fill: { fgColor: { rgb: RESULT_HEADER.bg } }, border: border({ thickBottom: idx === rows.length - 1 }) }),
    ]);
  });

  const sum = (f: (r: PayrollLedgerData['rows'][number]) => number) => rows.reduce((s, r) => s + f(r), 0);
  aoa.push([
    cell(`합계 (${rows.length}명)`, { font: { bold: true, sz: BASE_SZ }, fill: { fgColor: { rgb: TOTAL_ROW_BG } }, border: border({ thickTop: true }) }),
    cell('', { fill: { fgColor: { rgb: TOTAL_ROW_BG } }, border: border({ thickTop: true }) }),
    cell('', { fill: { fgColor: { rgb: TOTAL_ROW_BG } }, border: border({ thickTop: true }) }),
    cell('', { fill: { fgColor: { rgb: TOTAL_ROW_BG } }, border: border({ thickTop: true }) }),
    cell(sum(r => r.base_amount), { numFmt: '#,##0', alignment: { horizontal: 'right' }, font: { bold: true, sz: BASE_SZ }, fill: { fgColor: { rgb: TOTAL_ROW_BG } }, border: border({ thickTop: true }) }),
    ...allowance_columns.map(name => cell(sum(r => r.allowance_by_name[name] || 0), { numFmt: '#,##0', alignment: { horizontal: 'right' }, font: { bold: true, sz: BASE_SZ }, fill: { fgColor: { rgb: TOTAL_ROW_BG } }, border: border({ thickTop: true }) })),
    cell(sum(r => r.gross_amount), { numFmt: '#,##0', alignment: { horizontal: 'right' }, font: { bold: true, sz: BASE_SZ }, fill: { fgColor: { rgb: TOTAL_ROW_BG } }, border: border({ thickTop: true }) }),
    ...deduction_columns.map(name => cell(sum(r => r.deduction_by_name[name] || 0), { numFmt: '#,##0', alignment: { horizontal: 'right' }, font: { bold: true, sz: BASE_SZ }, fill: { fgColor: { rgb: TOTAL_ROW_BG } }, border: border({ thickTop: true }) })),
    cell(sum(r => r.total_deduction), { numFmt: '#,##0', alignment: { horizontal: 'right' }, font: { bold: true, sz: BASE_SZ }, fill: { fgColor: { rgb: TOTAL_ROW_BG } }, border: border({ thickTop: true }) }),
    cell(sum(r => r.net_amount), { numFmt: '#,##0', alignment: { horizontal: 'right' }, font: { bold: true, sz: BASE_SZ }, fill: { fgColor: { rgb: TOTAL_ROW_BG } }, border: border({ thickTop: true }) }),
  ]);

  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  worksheet['!cols'] = [
    { wch: 6 }, { wch: 10 }, { wch: 16 }, { wch: 12 }, { wch: 12 },
    ...allowance_columns.map(() => ({ wch: 11 })),
    { wch: 12 },
    ...deduction_columns.map(() => ({ wch: 11 })),
    { wch: 12 }, { wch: 13 },
  ];
  worksheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, `${period.year_month} 급여대장`);
  const fileName = `${companyName}_${period.year_month}_급여대장.xlsx`;

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
