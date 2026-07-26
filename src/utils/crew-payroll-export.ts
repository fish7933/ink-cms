import * as XLSX from 'xlsx-js-style';
import JSZip from 'jszip';
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

// 각 열의 실제 내용(헤더+값) 길이에 맞춰 너비를 계산 — 고정폭이면 이름/항목명이 길 때
// 잘려 보이는 문제가 있어, 시트를 만들 때마다 데이터에서 직접 폭을 뽑아 쓴다.
export function autoColWidths(aoa: ReturnType<typeof cell>[][], count: number, opts: { min?: number; max?: number; startRow?: number } = {}): { wch: number }[] {
  const min = opts.min ?? 8;
  const max = opts.max ?? 26;
  const startRow = opts.startRow ?? 0;
  const widths = Array.from({ length: count }, () => min);
  for (let r = startRow; r < aoa.length; r++) {
    const row = aoa[r];
    for (let i = 0; i < count && i < row.length; i++) {
      const raw = row[i]?.v;
      const text = typeof raw === 'number' ? raw.toLocaleString('en-US') : String(raw ?? '');
      widths[i] = Math.min(max, Math.max(widths[i], text.length + 2));
    }
  }
  return widths.map(w => ({ wch: w }));
}

// xlsx-js-style(SheetJS 커뮤니티 빌드)은 인쇄 배율(fitToWidth/fitToHeight, 용지 방향) 쓰기를
// 지원하지 않아 워크북 생성 API만으로는 "한 페이지에 맞춤"을 걸 수 없다 — 만들어진 xlsx는
// zip이므로, 시트별 XML에 표준 OOXML 순서(mergeCells → pageMargins → pageSetup → ignoredErrors)를
// 지켜 pageSetup을 직접 끼워 넣는다. 급여대장(1번 시트)은 가로로 넓어 폭만 한 페이지에 맞추고
// (세로는 인원 수만큼 여러 페이지 허용), 개인 급여명세서(2번 시트부터)는 서명란까지 포함해
// 통째로 한 페이지에 들어가야 하므로 세로도 한 페이지로 맞춘다.
export async function applyPrintFit(buffer: ArrayBuffer, sheetCount: number): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(buffer);
  for (let i = 1; i <= sheetCount; i++) {
    const path = `xl/worksheets/sheet${i}.xml`;
    const file = zip.file(path);
    if (!file) continue;
    let xml = await file.async('string');
    const isLedger = i === 1;
    const orientation = isLedger ? 'landscape' : 'portrait';
    const fitToHeight = isLedger ? 0 : 1;
    if (!xml.includes('<sheetPr')) {
      xml = xml.replace(/(<worksheet[^>]*>)/, `$1<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>`);
    }
    const pageSetupTag = `<pageSetup paperSize="9" orientation="${orientation}" fitToWidth="1" fitToHeight="${fitToHeight}"/>`;
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
  const headerLabels = ['Rank', 'Grade', 'Name', 'Pay Period', 'Days', ...allowance_columns, 'GROSS', ...deduction_columns, 'DEDUCT', 'Net Pay'];
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
    const isDeduction = i > grossCol && label !== 'DEDUCT' && label !== 'Net Pay';
    const isResult = label === 'DEDUCT' || label === 'Net Pay' || label === 'GROSS';
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

  // 열 너비는 급여대장 표 부분(제목/템플릿 참고표 제외)의 실제 내용 길이로 계산한다.
  const dataRowCount = aoa.length;
  appendTemplateMatrixRows(aoa, template_name, ledger.template_matrix);

  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  worksheet['!cols'] = autoColWidths(aoa.slice(0, dataRowCount), colCount, { min: 8, max: 22, startRow: 2 });
  worksheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } }];
  worksheet['!margins'] = { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 };
  return worksheet;
}

const DEFERRED_HEADER = { bg: 'F5EDD0', fg: '7A6110' };
const DEFERRED_BORDER = 'D9C58A';

// 선원 개인 급여명세서 — 프린트용 CrewPayslipDetailView와 동일한 구성(항목 순서/후불성
// 적립 표/설명 각주/계산 안내문/서명란)을 그대로 시트로 옮긴다.
function buildPayslipWorksheet(payslip: CrewPayslipWithDetails, shipName: string): XLSX.WorkSheet {
  const baseItems = payslip.items.filter(i => i.source === 'template' && i.category === 'earning' && i.payment_type !== 'deferred_accrual');
  const allowanceItems = payslip.items.filter(i => i.source === 'contract' && i.category === 'earning');
  const deductionItems = payslip.items.filter(i => i.category === 'deduction');
  const deferredItems = payslip.items.filter(i => i.payment_type === 'deferred_accrual');
  const ratio = payslip.days_in_month > 0 ? Math.round((payslip.days_served / payslip.days_in_month) * 1000) / 10 : 0;
  const COLS = 4;

  const legendEntries: [string, string][] = [];
  const seenLegend = new Set<string>();
  for (const item of payslip.items) {
    if (!item.description) continue;
    const baseName = item.name.replace(/\s*\([^)]*\)\s*$/, '');
    if (seenLegend.has(baseName)) continue;
    seenLegend.add(baseName);
    legendEntries.push([baseName, item.description]);
  }

  const aoa: ReturnType<typeof cell>[][] = [];
  const titleStyle = { font: { bold: true, sz: 13 }, alignment: { horizontal: 'center' as const } };
  const labelStyle = { font: { sz: BASE_SZ, color: { rgb: '777777' } } };
  const valueStyle = { font: { sz: BASE_SZ, bold: true } };
  const blankRow = () => [cell('', {}), cell('', {}), cell('', {}), cell('', {})];

  aoa.push([cell('CREW PAYSLIP', titleStyle), cell('', {}), cell('', {}), cell('', {})]);
  aoa.push([cell(payslip.period_year_month || payslip.created_at.slice(0, 7), { alignment: { horizontal: 'center' }, font: { sz: BASE_SZ, color: { rgb: '777777' } } }), cell('', {}), cell('', {}), cell('', {})]);
  aoa.push(blankRow());

  aoa.push([cell('Rank', labelStyle), cell(`${payslip.rank_code || payslip.rank_name}${payslip.rank_grade ? `(${payslip.rank_grade})` : ''}`, valueStyle), cell('Name', labelStyle), cell(payslip.crew_name, valueStyle)]);
  aoa.push([cell('Vessel', labelStyle), cell(shipName || '-', valueStyle), cell('Nationality', labelStyle), cell(payslip.nationality || '-', valueStyle)]);
  aoa.push([cell('Pay Period', labelStyle), cell(`${payslip.period_start_date} ~ ${payslip.period_end_date}`, valueStyle), cell('Days Served', labelStyle), cell(`${payslip.days_served} / ${payslip.days_in_month} days (${ratio}%)`, valueStyle)]);
  aoa.push(blankRow());

  const sectionHeader = (label: string, deduction?: boolean) => [
    cell(label, { font: { bold: true, sz: BASE_SZ, color: { rgb: deduction ? DEDUCTION_HEADER.fg : HEADER.fg } }, fill: { fgColor: { rgb: deduction ? DEDUCTION_HEADER.bg : HEADER.bg } }, border: border({ thickTop: true, thickBottom: true }) }),
    cell('', { fill: { fgColor: { rgb: deduction ? DEDUCTION_HEADER.bg : HEADER.bg } }, border: border({ thickTop: true, thickBottom: true }) }),
    cell('Type', { font: { bold: true, sz: BASE_SZ, color: { rgb: deduction ? DEDUCTION_HEADER.fg : HEADER.fg } }, fill: { fgColor: { rgb: deduction ? DEDUCTION_HEADER.bg : HEADER.bg } }, alignment: { horizontal: 'center' }, border: border({ thickTop: true, thickBottom: true }) }),
    cell('Amount', { font: { bold: true, sz: BASE_SZ, color: { rgb: deduction ? DEDUCTION_HEADER.fg : HEADER.fg } }, fill: { fgColor: { rgb: deduction ? DEDUCTION_HEADER.bg : HEADER.bg } }, alignment: { horizontal: 'right' }, border: border({ thickTop: true, thickBottom: true }) }),
  ];

  aoa.push(sectionHeader('EARNINGS'));
  if (baseItems.length === 0 && allowanceItems.length === 0) {
    aoa.push([cell('No earning items.', { font: { sz: BASE_SZ, color: { rgb: '999999' } }, border: border() }), cell('', { border: border() }), cell('', { border: border() }), cell('', { border: border() })]);
  }
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

  if (legendEntries.length > 0) {
    const legendText = legendEntries.map(([name, desc]) => `${name}: ${desc}`).join('  ·  ');
    aoa.push([cell(legendText, { font: { sz: 8, color: { rgb: '999999' } } }), cell('', {}), cell('', {}), cell('', {})]);
    aoa.push(blankRow());
  }

  aoa.push([
    cell('NET PAY', { font: { bold: true, sz: 12 }, fill: { fgColor: { rgb: RESULT_HEADER.bg } }, border: border({ thickTop: true, thickBottom: true }) }),
    cell('', { fill: { fgColor: { rgb: RESULT_HEADER.bg } }, border: border({ thickTop: true, thickBottom: true }) }),
    cell('', { fill: { fgColor: { rgb: RESULT_HEADER.bg } }, border: border({ thickTop: true, thickBottom: true }) }),
    cell(`${payslip.net_amount.toLocaleString('en-US')} ${payslip.currency}`, { font: { bold: true, sz: 12 }, alignment: { horizontal: 'right' }, fill: { fgColor: { rgb: RESULT_HEADER.bg } }, border: border({ thickTop: true, thickBottom: true }) }),
  ]);

  if (deferredItems.length > 0) {
    aoa.push(blankRow());
    aoa.push([cell('Deferred Pay (Accrued, Not Yet Paid)', { font: { bold: true, sz: BASE_SZ, color: { rgb: '333333' } } }), cell('', {}), cell('', {}), cell('', {})]);
    aoa.push([
      cell('Item', { font: { bold: true, sz: BASE_SZ, color: { rgb: DEFERRED_HEADER.fg } }, fill: { fgColor: { rgb: DEFERRED_HEADER.bg } }, border: border({ thickTop: true, thickBottom: true }) }),
      cell('', { fill: { fgColor: { rgb: DEFERRED_HEADER.bg } }, border: border({ thickTop: true, thickBottom: true }) }),
      cell('Accrued This Month', { font: { bold: true, sz: BASE_SZ, color: { rgb: DEFERRED_HEADER.fg } }, fill: { fgColor: { rgb: DEFERRED_HEADER.bg } }, alignment: { horizontal: 'right' }, border: border({ thickTop: true, thickBottom: true }) }),
      cell('Total Accrued to Date', { font: { bold: true, sz: BASE_SZ, color: { rgb: DEFERRED_HEADER.fg } }, fill: { fgColor: { rgb: DEFERRED_HEADER.bg } }, alignment: { horizontal: 'right' }, border: border({ thickTop: true, thickBottom: true }) }),
    ]);
    deferredItems.forEach(item => {
      aoa.push([
        cell(item.name, { font: { sz: BASE_SZ }, border: { ...border(), top: { style: 'thin', color: { rgb: DEFERRED_BORDER } } } }),
        cell('', { border: { ...border(), top: { style: 'thin', color: { rgb: DEFERRED_BORDER } } } }),
        cell(item.amount, { numFmt: '#,##0', font: { sz: BASE_SZ }, alignment: { horizontal: 'right' }, border: { ...border(), top: { style: 'thin', color: { rgb: DEFERRED_BORDER } } } }),
        cell(item.accrued_to_date ?? item.amount, { numFmt: '#,##0', font: { sz: BASE_SZ, bold: true }, alignment: { horizontal: 'right' }, border: { ...border(), top: { style: 'thin', color: { rgb: DEFERRED_BORDER } } } }),
      ]);
    });
  }

  aoa.push(blankRow());
  aoa.push([cell('Calculation Notes', { font: { bold: true, sz: BASE_SZ, color: { rgb: '333333' } } }), cell('', {}), cell('', {}), cell('', {})]);
  aoa.push([cell(
    `Base pay, allowances and deductions are pro-rated based on the vessel's salary template and the crew member's contract terms, for the actual period served this month (${payslip.period_start_date} ~ ${payslip.period_end_date}, ${payslip.days_served}/${payslip.days_in_month} days).`,
    { font: { sz: 8, color: { rgb: '666666' } } }
  ), cell('', {}), cell('', {}), cell('', {})]);
  aoa.push([cell(
    'Allowances marked "(Owner Billed)" are billed separately to the shipowner rather than paid by the vessel/company, and are excluded from Net Pay.',
    { font: { sz: 8, color: { rgb: '666666' } } }
  ), cell('', {}), cell('', {}), cell('', {})]);
  if (deferredItems.length > 0) {
    aoa.push([cell(
      'Deferred (leave-type) pay items accrue monthly but are not paid out until the sign-off month, when the full accrued balance is paid as a lump sum (see "Deferred Pay" above).',
      { font: { sz: 8, color: { rgb: '666666' } } }
    ), cell('', {}), cell('', {}), cell('', {})]);
  }

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
  worksheet['!cols'] = autoColWidths(aoa, COLS, { min: 12, max: 24, startRow: 2 });
  worksheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: COLS - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: COLS - 1 } },
  ];
  worksheet['!margins'] = { left: 0.35, right: 0.35, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 };
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
  const rawBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  const buffer = await applyPrintFit(rawBuffer, workbook.SheetNames.length);

  const picker = (window as SaveFilePickerWindow).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker({
        suggestedName: fileName,
        types: [{ description: 'Excel Workbook', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(buffer as unknown as BlobPart);
      await writable.close();
      return;
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return;
    }
  }
  const blob = new Blob([buffer as unknown as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// 급여대장 시트 + 선원별 급여명세서 시트를 하나의 엑셀로 내려받는다.
export async function exportCrewPayrollLedgerToExcel(ledger: CrewPayrollLedgerData, payslips: CrewPayslipWithDetails[]): Promise<void> {
  const workbook = buildCrewPayrollFullWorkbook(ledger, payslips);
  const fileName = `${ledger.ship_name}_${ledger.period.year_month}_Payroll.xlsx`;
  await writeWorkbookToFile(workbook, fileName);
}
