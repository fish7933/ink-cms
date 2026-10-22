import * as XLSX from 'xlsx-js-style';

// EmployeePayrollLedgerExport와 같은 흑백 위주의 정형화된 서식 톤(옅은 회색 헤더 + 공제 항목만
// 빨간 글자)을 그대로 따른다 — 급여대장(월별, 전 직원) 엑셀과 짝이 되는 연도별(월별, 1인) 엑셀.
const HEADER = { bg: 'F5F5F5', fg: '333333' };
const DEDUCTION_HEADER = { bg: 'F5F5F5', fg: 'A33333' };
const RESULT_HEADER = { bg: 'EFEFEF', fg: '222222' };
const TOTAL_ROW_BG = 'F7F7F7';
const THIN = 'CCCCCC';
const THICK = '888888';
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

export interface AnnualLedgerColumn {
  groupKey: string;
  groupLabel: string;
  name: string;
}

export interface AnnualLedgerRow {
  month: string;
  hasPayslip: boolean;
  amounts: Record<string, number>;
  paymentTotal: number;
  deductionTotal: number;
  netAmount: number;
}

export interface AnnualLedgerExportData {
  employeeName: string;
  year: string;
  groupSpans: { groupKey: string; groupLabel: string; count: number }[];
  columns: AnnualLedgerColumn[];
  rows: AnnualLedgerRow[];
  totals: { byColumn: Record<string, number>; paymentTotal: number; deductionTotal: number; netAmount: number };
}

export function buildAnnualPayrollLedgerWorkbook(data: AnnualLedgerExportData, companyName: string): XLSX.WorkBook {
  const { employeeName, year, groupSpans, columns, rows, totals } = data;
  const colCount = 1 + columns.length + 3; // 월 + 항목들 + 지급총액/공제총액/실지급액
  const isDeductionCol = (c: AnnualLedgerColumn) => c.groupKey === 'deduction';

  const aoa: ReturnType<typeof cell>[][] = [];

  aoa.push([
    cell(`${companyName}  ${employeeName}  ${year}년 급여 내역`, { font: { bold: true, sz: 12 }, alignment: { horizontal: 'center' } }),
    ...Array.from({ length: colCount - 1 }, () => cell('', {})),
  ]);
  aoa.push(Array.from({ length: colCount }, () => cell('', {})));

  const groupHeaderStyle = (deduction: boolean) => ({
    font: { bold: true, sz: BASE_SZ, color: { rgb: deduction ? DEDUCTION_HEADER.fg : HEADER.fg } },
    fill: { fgColor: { rgb: deduction ? DEDUCTION_HEADER.bg : HEADER.bg } },
    alignment: { horizontal: 'center' as const, vertical: 'center' as const },
    border: border({ thickTop: true }),
  });
  const resultHeaderStyle = {
    font: { bold: true, sz: BASE_SZ, color: { rgb: RESULT_HEADER.fg } },
    fill: { fgColor: { rgb: RESULT_HEADER.bg } },
    alignment: { horizontal: 'center' as const, vertical: 'center' as const },
    border: border({ thickTop: true }),
  };

  // 헤더 1행 — 월 / 그룹 라벨(고정급여·수당·비과세·기타급여·공제) / 지급총액·공제총액·실지급액
  aoa.push([
    cell('월', groupHeaderStyle(false)),
    ...groupSpans.flatMap(g => {
      const deduction = g.groupKey === 'deduction';
      return [cell(g.groupLabel, groupHeaderStyle(deduction)), ...Array.from({ length: g.count - 1 }, () => cell('', groupHeaderStyle(deduction)))];
    }),
    cell('지급총액', resultHeaderStyle),
    cell('공제총액', resultHeaderStyle),
    cell('실지급액', resultHeaderStyle),
  ]);

  // 헤더 2행 — 항목명 (월/총액 칸은 1행과 병합되어 비워둠)
  aoa.push([
    cell('', groupHeaderStyle(false)),
    ...columns.map(c => cell(c.name, { ...groupHeaderStyle(isDeductionCol(c)), border: border({ thickBottom: true }) })),
    cell('', { ...resultHeaderStyle, border: border({ thickBottom: true }) }),
    cell('', { ...resultHeaderStyle, border: border({ thickBottom: true }) }),
    cell('', { ...resultHeaderStyle, border: border({ thickBottom: true }) }),
  ]);

  rows.forEach((r, idx) => {
    const isLast = idx === rows.length - 1;
    const dim = !r.hasPayslip;
    aoa.push([
      cell(`${Number(r.month)}월`, { alignment: { horizontal: 'center' }, font: { sz: BASE_SZ, bold: true }, border: border({ thickBottom: isLast }) }),
      ...columns.map(c => cell(r.hasPayslip ? (r.amounts[c.name] || 0) : 0, {
        numFmt: '#,##0', alignment: { horizontal: 'right' }, font: { sz: BASE_SZ, color: { rgb: dim ? 'AAAAAA' : (isDeductionCol(c) ? DEDUCTION_HEADER.fg : '222222') } }, border: border({ thickBottom: isLast }),
      })),
      cell(r.hasPayslip ? r.paymentTotal : 0, { numFmt: '#,##0', alignment: { horizontal: 'right' }, font: { sz: BASE_SZ, bold: true, color: { rgb: dim ? 'AAAAAA' : '222222' } }, fill: { fgColor: { rgb: RESULT_HEADER.bg } }, border: border({ thickBottom: isLast }) }),
      cell(r.hasPayslip ? r.deductionTotal : 0, { numFmt: '#,##0', alignment: { horizontal: 'right' }, font: { sz: BASE_SZ, bold: true, color: { rgb: dim ? 'AAAAAA' : DEDUCTION_HEADER.fg } }, fill: { fgColor: { rgb: RESULT_HEADER.bg } }, border: border({ thickBottom: isLast }) }),
      cell(r.hasPayslip ? r.netAmount : 0, { numFmt: '#,##0', alignment: { horizontal: 'right' }, font: { sz: BASE_SZ, bold: true, color: { rgb: dim ? 'AAAAAA' : '222222' } }, fill: { fgColor: { rgb: RESULT_HEADER.bg } }, border: border({ thickBottom: isLast }) }),
    ]);
  });

  aoa.push([
    cell(`${year}년 합계`, { font: { bold: true, sz: BASE_SZ }, fill: { fgColor: { rgb: TOTAL_ROW_BG } }, border: border({ thickTop: true }) }),
    ...columns.map(c => cell(totals.byColumn[c.name] || 0, {
      numFmt: '#,##0', alignment: { horizontal: 'right' }, font: { bold: true, sz: BASE_SZ, color: { rgb: isDeductionCol(c) ? DEDUCTION_HEADER.fg : '222222' } }, fill: { fgColor: { rgb: TOTAL_ROW_BG } }, border: border({ thickTop: true }),
    })),
    cell(totals.paymentTotal, { numFmt: '#,##0', alignment: { horizontal: 'right' }, font: { bold: true, sz: BASE_SZ }, fill: { fgColor: { rgb: TOTAL_ROW_BG } }, border: border({ thickTop: true }) }),
    cell(totals.deductionTotal, { numFmt: '#,##0', alignment: { horizontal: 'right' }, font: { bold: true, sz: BASE_SZ, color: { rgb: DEDUCTION_HEADER.fg } }, fill: { fgColor: { rgb: TOTAL_ROW_BG } }, border: border({ thickTop: true }) }),
    cell(totals.netAmount, { numFmt: '#,##0', alignment: { horizontal: 'right' }, font: { bold: true, sz: BASE_SZ }, fill: { fgColor: { rgb: TOTAL_ROW_BG } }, border: border({ thickTop: true }) }),
  ]);

  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  worksheet['!cols'] = [
    { wch: 8 },
    ...columns.map(() => ({ wch: 11 })),
    { wch: 13 }, { wch: 13 }, { wch: 13 },
  ];

  const merges: XLSX.Range[] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } }, // 제목
    { s: { r: 2, c: 0 }, e: { r: 3, c: 0 } }, // 월
    { s: { r: 2, c: colCount - 3 }, e: { r: 3, c: colCount - 3 } }, // 지급총액
    { s: { r: 2, c: colCount - 2 }, e: { r: 3, c: colCount - 2 } }, // 공제총액
    { s: { r: 2, c: colCount - 1 }, e: { r: 3, c: colCount - 1 } }, // 실지급액
  ];
  let colIdx = 1;
  for (const g of groupSpans) {
    if (g.count > 1) merges.push({ s: { r: 2, c: colIdx }, e: { r: 2, c: colIdx + g.count - 1 } });
    colIdx += g.count;
  }
  worksheet['!merges'] = merges;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, `${year}년 급여 내역`);
  return workbook;
}

export async function exportAnnualPayrollLedgerToExcel(data: AnnualLedgerExportData, companyName: string): Promise<void> {
  const workbook = buildAnnualPayrollLedgerWorkbook(data, companyName);
  const fileName = `${companyName}_${data.employeeName}_${data.year}년_급여내역.xlsx`;

  const picker = (window as Window & { showSaveFilePicker?: (options: {
    suggestedName?: string;
    types?: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<{ createWritable: () => Promise<{ write: (data: BlobPart) => Promise<void>; close: () => Promise<void> }> }> }).showSaveFilePicker;
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
