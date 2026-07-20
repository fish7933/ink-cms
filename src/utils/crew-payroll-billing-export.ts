import * as XLSX from 'xlsx-js-style';
import { cell, border, HEADER, DEDUCTION_HEADER, RESULT_HEADER, TOTAL_ROW_BG, BASE_SZ, fmtMD } from '@/utils/crew-payroll-export';
import type { CrewPayrollBillingData, CrewPayrollBillingShipSection } from '@/types/crew-payroll';

const OWNER_BILLED_HEADER = { bg: 'FFF3E0', fg: '9A6300' };

function buildSummarySheet(data: CrewPayrollBillingData): XLSX.WorkSheet {
  const headers = ['Owner', 'Fleet', 'Vessel', 'Crew', 'Total Net Pay', 'Total Owner Billed'];
  const aoa: ReturnType<typeof cell>[][] = [];
  aoa.push([
    cell(`${data.group_label}  ${data.year_month} Crew Payroll Claim`, { font: { bold: true, sz: 12 }, alignment: { horizontal: 'center' } }),
    ...Array.from({ length: headers.length - 1 }, () => cell('', {})),
  ]);
  aoa.push(Array.from({ length: headers.length }, () => cell('', {})));
  aoa.push(headers.map(label => cell(label, {
    font: { bold: true, sz: BASE_SZ, color: { rgb: HEADER.fg } },
    fill: { fgColor: { rgb: HEADER.bg } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: border({ thickTop: true, thickBottom: true }),
  })));

  data.ships.forEach((s, idx) => {
    aoa.push([
      cell(s.owner_name || '-', { alignment: { horizontal: 'center' }, font: { sz: BASE_SZ }, border: border() }),
      cell(s.fleet_name || '-', { alignment: { horizontal: 'center' }, font: { sz: BASE_SZ }, border: border() }),
      cell(s.ship_name, { alignment: { horizontal: 'center' }, font: { sz: BASE_SZ, bold: true }, border: border() }),
      cell(s.rows.length, { alignment: { horizontal: 'center' }, font: { sz: BASE_SZ }, border: border() }),
      cell(s.subtotal_net, { numFmt: '#,##0', alignment: { horizontal: 'right' }, font: { sz: BASE_SZ, bold: true }, border: border() }),
      cell(s.subtotal_owner_billed, { numFmt: '#,##0', alignment: { horizontal: 'right' }, font: { sz: BASE_SZ, bold: true, color: { rgb: OWNER_BILLED_HEADER.fg } }, fill: { fgColor: { rgb: OWNER_BILLED_HEADER.bg } }, border: border({ thickBottom: idx === data.ships.length - 1 }) }),
    ]);
  });

  aoa.push([
    cell(`Total (${data.ships.length} vessels)`, { font: { bold: true, sz: BASE_SZ }, fill: { fgColor: { rgb: TOTAL_ROW_BG } }, border: border({ thickTop: true }) }),
    cell('', { fill: { fgColor: { rgb: TOTAL_ROW_BG } }, border: border({ thickTop: true }) }),
    cell('', { fill: { fgColor: { rgb: TOTAL_ROW_BG } }, border: border({ thickTop: true }) }),
    cell(data.ships.reduce((s, sec) => s + sec.rows.length, 0), { alignment: { horizontal: 'center' }, font: { bold: true, sz: BASE_SZ }, fill: { fgColor: { rgb: TOTAL_ROW_BG } }, border: border({ thickTop: true }) }),
    cell(data.grand_total_net, { numFmt: '#,##0', alignment: { horizontal: 'right' }, font: { bold: true, sz: BASE_SZ }, fill: { fgColor: { rgb: TOTAL_ROW_BG } }, border: border({ thickTop: true }) }),
    cell(data.grand_total_owner_billed, { numFmt: '#,##0', alignment: { horizontal: 'right' }, font: { bold: true, sz: BASE_SZ, color: { rgb: OWNER_BILLED_HEADER.fg } }, fill: { fgColor: { rgb: TOTAL_ROW_BG } }, border: border({ thickTop: true }) }),
  ]);

  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  worksheet['!cols'] = [{ wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 8 }, { wch: 14 }, { wch: 14 }];
  worksheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }];
  return worksheet;
}

function buildShipDetailSheet(section: CrewPayrollBillingShipSection): XLSX.WorkSheet {
  const { allowance_columns, deduction_columns, rows } = section;
  const headerLabels = ['Rank', 'Grade', 'Name', 'Pay Period', 'Days', ...allowance_columns, 'Total Earnings', ...deduction_columns, 'Total Deductions', 'Net Pay', 'Owner Billed'];
  const colCount = headerLabels.length;
  const grossCol = 4 + allowance_columns.length;

  const aoa: ReturnType<typeof cell>[][] = [];
  const titleParts = [section.owner_name, section.fleet_name, section.ship_name].filter(Boolean).join(' > ');
  aoa.push([
    cell(`${titleParts}  ${section.period_year_month} Payroll Ledger`, { font: { bold: true, sz: 12 }, alignment: { horizontal: 'center' } }),
    ...Array.from({ length: colCount - 1 }, () => cell('', {})),
  ]);
  aoa.push(Array.from({ length: colCount }, () => cell('', {})));

  aoa.push(headerLabels.map((label, i) => {
    const isDeduction = i > grossCol && label !== 'Total Deductions' && label !== 'Net Pay' && label !== 'Owner Billed';
    const isOwnerBilled = label === 'Owner Billed';
    const isResult = label === 'Total Deductions' || label === 'Net Pay' || label === 'Total Earnings';
    const colors = isOwnerBilled ? OWNER_BILLED_HEADER : isDeduction ? DEDUCTION_HEADER : isResult ? RESULT_HEADER : HEADER;
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
      cell(r.net_amount, { numFmt: '#,##0', alignment: { horizontal: 'right' }, font: { sz: BASE_SZ, bold: true }, fill: { fgColor: { rgb: RESULT_HEADER.bg } }, border: border() }),
      cell(r.owner_billed_amount, { numFmt: '#,##0', alignment: { horizontal: 'right' }, font: { sz: BASE_SZ, bold: true, color: { rgb: OWNER_BILLED_HEADER.fg } }, fill: { fgColor: { rgb: OWNER_BILLED_HEADER.bg } }, border: border({ thickBottom: idx === rows.length - 1 }) }),
    ]);
  });

  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + f(r), 0);
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
    cell(sum(r => r.owner_billed_amount), { numFmt: '#,##0', alignment: { horizontal: 'right' }, font: { bold: true, sz: BASE_SZ, color: { rgb: OWNER_BILLED_HEADER.fg } }, fill: { fgColor: { rgb: TOTAL_ROW_BG } }, border: border({ thickTop: true }) }),
  ]);

  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  worksheet['!cols'] = [
    { wch: 14 }, { wch: 8 }, { wch: 8 }, { wch: 13 }, { wch: 10 },
    ...allowance_columns.map(() => ({ wch: 11 })),
    { wch: 12 },
    ...deduction_columns.map(() => ({ wch: 11 })),
    { wch: 12 }, { wch: 13 }, { wch: 12 },
  ];
  worksheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } }];
  return worksheet;
}

export function buildCrewPayrollBillingWorkbook(data: CrewPayrollBillingData): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, buildSummarySheet(data), 'Summary');
  data.ships.forEach((section, idx) => {
    const sheetName = `${idx + 1}_${section.ship_name}`.slice(0, 31);
    XLSX.utils.book_append_sheet(workbook, buildShipDetailSheet(section), sheetName);
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

export async function exportCrewPayrollBillingToExcel(data: CrewPayrollBillingData): Promise<void> {
  const workbook = buildCrewPayrollBillingWorkbook(data);
  const fileName = `${data.group_label}_${data.year_month}_CrewPayrollClaim.xlsx`;

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
