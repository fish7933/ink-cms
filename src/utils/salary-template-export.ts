import * as XLSX from 'xlsx-js-style';
import type { SalaryTemplateWithItems, SalaryComponent } from '@/lib/salary-store';
import type { Rank } from '@/types/models';

// 컬러/구조는 SalaryTemplatePrintPage.tsx 인쇄 디자인과 맞춤
const RANK_HEADER = { bg: 'E0E7FF', fg: '3730A3' };
const EARNING_HEADER = { bg: 'DBEAFE', fg: '1E40AF' };
const DEDUCTION_HEADER = { bg: 'FEE2E2', fg: 'B91C1C' };
const RESULT_HEADER = { bg: 'E5E7EB', fg: '374151' };
const COL_HEADER_BG = 'FAFAFA';
const RANK_CELL_BG = 'FAFAFA';
const ZEBRA_BG = 'FBFBFB';
const DEDUCTION_CELL = { bg: 'FEF2F2', fg: 'B91C1C' };
const TW_CELL_BG = 'F3F4F6';
const AW_CELL = { bg: 'EFF6FF', fg: '1E40AF' };
const THIN = 'CCCCCC';
const THICK = '333333';
const TITLE_SZ = 14;
const BASE_SZ = 9;

const border = (opts: { thickLeft?: boolean; thickTop?: boolean; thickBottom?: boolean } = {}) => ({
  top: { style: opts.thickTop ? 'medium' : 'thin', color: { rgb: opts.thickTop ? THICK : THIN } },
  bottom: { style: opts.thickBottom ? 'medium' : 'thin', color: { rgb: opts.thickBottom ? THICK : THIN } },
  left: { style: opts.thickLeft ? 'medium' : 'thin', color: { rgb: opts.thickLeft ? THICK : THIN } },
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

export async function exportSalaryTemplateToExcel(
  template: SalaryTemplateWithItems,
  components: SalaryComponent[],
  ranks: Rank[],
): Promise<void> {
  const rankCodeOf = (rankName: string) => ranks.find(r => r.name === rankName)?.rank_code || rankName;
  const gradesForRank = (rank: string): string[] =>
    Array.from(new Set(template.items.filter(i => i.rank === rank && i.rank_grade).map(i => i.rank_grade as string))).sort();

  const earningIds = components
    .filter(c => (c.component_type ?? 'earning') === 'earning' && template.items.some(i => i.component_id === c.id))
    .map(c => c.id);
  const deductionIds = components
    .filter(c => c.component_type === 'deduction' && template.items.some(i => i.component_id === c.id))
    .map(c => c.id);
  const orderedComps = [...earningIds, ...deductionIds]
    .map(cid => components.find(c => c.id === cid))
    .filter((c): c is SalaryComponent => Boolean(c));

  const colCount = 1 + orderedComps.length + 2;
  const firstDeductionCol = earningIds.length > 0 && deductionIds.length > 0 ? 1 + earningIds.length : -1;
  const resultCol = 1 + orderedComps.length;

  const rows: ReturnType<typeof cell>[][] = [];

  // 제목 영역 (인쇄 페이지 상단과 동일한 구성)
  rows.push([
    cell('WAGE TABLE', { font: { italic: true, sz: BASE_SZ, color: { rgb: '888888' } }, alignment: { horizontal: 'center' } }),
    ...Array.from({ length: colCount - 1 }, () => cell('', {})),
  ]);
  rows.push([
    cell(template.name, { font: { bold: true, sz: TITLE_SZ }, alignment: { horizontal: 'center' } }),
    ...Array.from({ length: colCount - 1 }, () => cell('', {})),
  ]);
  rows.push([
    cell(
      `통화 ${template.currency}   |   유효기간 ${template.effective_from} ~ ${template.effective_until || '현재'}`,
      {
        font: { sz: BASE_SZ, color: { rgb: '555555' } },
        alignment: { horizontal: 'center' },
        border: { bottom: { style: 'medium', color: { rgb: THICK } } },
      },
    ),
    ...Array.from({ length: colCount - 1 }, () =>
      cell('', { border: { bottom: { style: 'medium', color: { rgb: THICK } } } }),
    ),
  ]);
  rows.push(Array.from({ length: colCount }, () => cell('', {})));

  const titleRowCount = rows.length; // 4

  // 그룹 헤더 행 (직급 / 급여 구성 항목 / 공제 항목 / 계산 결과)
  const groupRow: ReturnType<typeof cell>[] = [
    cell('직급', {
      font: { bold: true, sz: BASE_SZ, color: { rgb: RANK_HEADER.fg } },
      fill: { fgColor: { rgb: RANK_HEADER.bg } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: border({ thickTop: true, thickLeft: true }),
    }),
  ];
  if (earningIds.length > 0) {
    groupRow.push(
      cell('급여 구성 항목', {
        font: { bold: true, sz: BASE_SZ, color: { rgb: EARNING_HEADER.fg } },
        fill: { fgColor: { rgb: EARNING_HEADER.bg } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: border({ thickTop: true }),
      }),
      ...Array.from({ length: earningIds.length - 1 }, () =>
        cell('', { fill: { fgColor: { rgb: EARNING_HEADER.bg } }, border: border({ thickTop: true }) }),
      ),
    );
  }
  if (deductionIds.length > 0) {
    groupRow.push(
      cell('공제 항목', {
        font: { bold: true, sz: BASE_SZ, color: { rgb: DEDUCTION_HEADER.fg } },
        fill: { fgColor: { rgb: DEDUCTION_HEADER.bg } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: border({ thickTop: true, thickLeft: true }),
      }),
      ...Array.from({ length: deductionIds.length - 1 }, () =>
        cell('', { fill: { fgColor: { rgb: DEDUCTION_HEADER.bg } }, border: border({ thickTop: true }) }),
      ),
    );
  }
  groupRow.push(
    cell('계산 결과', {
      font: { bold: true, sz: BASE_SZ, color: { rgb: RESULT_HEADER.fg } },
      fill: { fgColor: { rgb: RESULT_HEADER.bg } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: border({ thickTop: true, thickLeft: true }),
    }),
    cell('', {
      fill: { fgColor: { rgb: RESULT_HEADER.bg } },
      border: border({ thickTop: true }),
    }),
  );
  // 오른쪽 끝 셀 두꺼운 테두리 보정
  groupRow[groupRow.length - 1].s = {
    ...groupRow[groupRow.length - 1].s,
    border: { ...(groupRow[groupRow.length - 1].s as Record<string, unknown>).border as object, right: { style: 'medium', color: { rgb: THICK } } },
  };
  rows.push(groupRow);

  // 컬럼 헤더 행 (개별 항목명 / TW / AW)
  rows.push([
    cell('', { fill: { fgColor: { rgb: RANK_HEADER.bg } }, border: border({ thickLeft: true, thickBottom: true }) }),
    ...orderedComps.map((c, i) => {
      const isDeduction = c.component_type === 'deduction';
      const isFirstDeduction = i === firstDeductionCol - 1;
      return cell(c.name, {
        font: { bold: true, sz: BASE_SZ },
        fill: { fgColor: { rgb: COL_HEADER_BG } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: border({ thickLeft: isFirstDeduction, thickBottom: true }),
      });
    }),
    cell('TW\n(월 총액)', {
      font: { bold: true, sz: BASE_SZ },
      fill: { fgColor: { rgb: COL_HEADER_BG } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: border({ thickLeft: true, thickBottom: true }),
    }),
    cell('AW\n(월 실지급액)', {
      font: { bold: true, sz: BASE_SZ },
      fill: { fgColor: { rgb: COL_HEADER_BG } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: { ...border({ thickBottom: true }), right: { style: 'medium', color: { rgb: THICK } } },
    }),
  ]);

  const merges: XLSX.Range[] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: colCount - 1 } },
    { s: { r: titleRowCount, c: 0 }, e: { r: titleRowCount + 1, c: 0 } }, // 직급 rowspan
  ];
  let mergeCol = 1;
  if (earningIds.length > 0) {
    merges.push({ s: { r: titleRowCount, c: mergeCol }, e: { r: titleRowCount, c: mergeCol + earningIds.length - 1 } });
    mergeCol += earningIds.length;
  }
  if (deductionIds.length > 0) {
    merges.push({ s: { r: titleRowCount, c: mergeCol }, e: { r: titleRowCount, c: mergeCol + deductionIds.length - 1 } });
    mergeCol += deductionIds.length;
  }
  merges.push({ s: { r: titleRowCount, c: resultCol }, e: { r: titleRowCount, c: resultCol + 1 } });

  let zebra = false;
  for (const rank of template.ranks) {
    const grades = gradesForRank(rank);
    const gradeRows: (string | null)[] = grades.length ? grades : [null];
    for (const grade of gradeRows) {
      const findItem = (compId: string) =>
        template.items.find(i => i.rank === rank && i.component_id === compId && (i.rank_grade || null) === grade);
      const earningTotal = orderedComps.reduce((s, comp) => {
        if ((comp.component_type ?? 'earning') !== 'earning') return s;
        return s + (findItem(comp.id)?.amount || 0);
      }, 0);
      const deferred = orderedComps.reduce((s, comp) => {
        if ((comp.component_type ?? 'earning') !== 'earning' || comp.payment_type !== 'deferred') return s;
        return s + (findItem(comp.id)?.amount || 0);
      }, 0);
      const deduction = orderedComps.reduce((s, comp) => {
        if (comp.component_type !== 'deduction') return s;
        return s + (findItem(comp.id)?.amount || 0);
      }, 0);

      const rankLabel = grade ? `${rankCodeOf(rank)} (${grade})` : rankCodeOf(rank);
      const zebraFill = zebra ? { fgColor: { rgb: ZEBRA_BG } } : undefined;

      rows.push([
        cell(rankLabel, {
          font: { bold: true, sz: BASE_SZ },
          fill: { fgColor: { rgb: RANK_CELL_BG } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: border({ thickLeft: true }),
        }),
        ...orderedComps.map((comp, i) => {
          const isDeduction = comp.component_type === 'deduction';
          const isFirstDeduction = i === firstDeductionCol - 1;
          return cell(findItem(comp.id)?.amount || 0, {
            numFmt: '#,##0',
            alignment: { horizontal: 'right' },
            fill: isDeduction ? { fgColor: { rgb: DEDUCTION_CELL.bg } } : zebraFill,
            font: { sz: BASE_SZ, color: isDeduction ? { rgb: DEDUCTION_CELL.fg } : undefined },
            border: border({ thickLeft: isFirstDeduction }),
          });
        }),
        cell(earningTotal, {
          numFmt: '#,##0',
          font: { bold: true, sz: BASE_SZ },
          fill: { fgColor: { rgb: TW_CELL_BG } },
          alignment: { horizontal: 'right' },
          border: border({ thickLeft: true }),
        }),
        cell(earningTotal - deferred - deduction, {
          numFmt: '#,##0',
          font: { bold: true, sz: BASE_SZ, color: { rgb: AW_CELL.fg } },
          fill: { fgColor: { rgb: AW_CELL.bg } },
          alignment: { horizontal: 'right' },
          border: { ...border({}), right: { style: 'medium', color: { rgb: THICK } } },
        }),
      ]);
      zebra = !zebra;
    }
  }

  // 마지막 데이터 행에 두꺼운 하단 테두리 적용 (표 외곽선 마감)
  const lastRow = rows[rows.length - 1];
  lastRow.forEach(c => {
    const s = c.s as { border?: Record<string, unknown> };
    c.s = { ...c.s, border: { ...s.border, bottom: { style: 'medium', color: { rgb: THICK } } } };
  });

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet['!cols'] = [{ wch: 18 }, ...orderedComps.map(() => ({ wch: 14 })), { wch: 14 }, { wch: 16 }];
  worksheet['!rows'] = [
    { hpt: 14 },
    { hpt: 22 },
    { hpt: 16 },
    { hpt: 6 },
    { hpt: 18 },
    { hpt: 26 },
  ];
  worksheet['!merges'] = merges;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Wage Table');
  const fileName = `${template.name}_${template.effective_from}.xlsx`;

  // 지원 브라우저(Chrome/Edge)에서는 저장 위치를 고를 수 있는 대화창을 띄운다.
  const picker = (window as SaveFilePickerWindow).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker({
        suggestedName: fileName,
        types: [{
          description: 'Excel Workbook',
          accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] },
        }],
      });
      const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const writable = await handle.createWritable();
      await writable.write(buffer);
      await writable.close();
      return;
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return; // 사용자가 취소함
      // 다른 오류(미지원 등)면 기본 다운로드로 대체
    }
  }
  XLSX.writeFile(workbook, fileName);
}
