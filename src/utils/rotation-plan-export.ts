import * as XLSX from 'xlsx-js-style';
import type { CrewRotationPlanWithDetails } from '@/types/rotation';

interface SaveFilePickerWindow extends Window {
  showSaveFilePicker?: (options: {
    suggestedName?: string;
    types?: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<{
    createWritable: () => Promise<{ write: (data: BlobPart) => Promise<void>; close: () => Promise<void> }>;
  }>;
}

const HEADER_BG_BOARD = 'D1FAE5';
const HEADER_FG_BOARD = '065F46';
const HEADER_BG_DISEMBARK = 'FFEDD5';
const HEADER_FG_DISEMBARK = '9A3412';
const ZEBRA_BG = 'F7F8FC';
const THIN = 'D1D5DB';
const THICK = '333333';
const BASE_SZ = 10;

function cell(v: string | number, style: Record<string, unknown> = {}) {
  return { v, t: typeof v === 'number' ? 'n' : 's', s: style };
}

const border = (opts: { thickTop?: boolean; thickBottom?: boolean; thickLeft?: boolean; thickRight?: boolean } = {}) => ({
  top: { style: opts.thickTop ? 'medium' : 'thin', color: { rgb: opts.thickTop ? THICK : THIN } },
  bottom: { style: opts.thickBottom ? 'medium' : 'thin', color: { rgb: opts.thickBottom ? THICK : THIN } },
  left: { style: opts.thickLeft ? 'medium' : 'thin', color: { rgb: opts.thickLeft ? THICK : THIN } },
  right: { style: opts.thickRight ? 'medium' : 'thin', color: { rgb: opts.thickRight ? THICK : THIN } },
});

const COL_LABELS = ['No.', '직급', '성명', '출국일', '승선일', '직급', '성명', '하선일', '귀국일'];
const COL_ALIGN: ('center' | 'left')[] = ['center', 'center', 'left', 'center', 'center', 'center', 'left', 'center', 'center'];

// 배승계획서 한 건의 워크시트를 만든다 — 좌: 신규 승선(IN), 우: 기존 하선(OUT). 단건/월별 내보내기 공용.
function buildRotationPlanWorksheet(plan: CrewRotationPlanWithDetails & { creator_name?: string }, portLabel?: string) {
  const colCount = COL_LABELS.length;
  const rows: ReturnType<typeof cell>[][] = [];

  // 제목
  rows.push([
    cell('배승계획서', { font: { bold: true, sz: 16 }, alignment: { horizontal: 'center' } }),
    ...Array.from({ length: colCount - 1 }, () => cell('', {})),
  ]);
  // 메타정보
  const metaLine1 = `계획명: ${plan.plan_name}   |   선박: ${plan.ship_name}   |   선주/플릿: ${plan.owner_name}${plan.fleet_name ? ` / ${plan.fleet_name}` : ''}`;
  const metaLine2 = `교대일: ${plan.rotation_date}   |   교대 항구: ${portLabel || '-'}   |   작성자: ${plan.creator_name || '-'}`;
  rows.push([
    cell(metaLine1, { font: { sz: BASE_SZ, color: { rgb: '444444' } }, alignment: { horizontal: 'center' } }),
    ...Array.from({ length: colCount - 1 }, () => cell('', {})),
  ]);
  rows.push([
    cell(metaLine2, {
      font: { sz: BASE_SZ, color: { rgb: '666666' } }, alignment: { horizontal: 'center' },
      border: { bottom: { style: 'medium', color: { rgb: THICK } } },
    }),
    ...Array.from({ length: colCount - 1 }, () => cell('', { border: { bottom: { style: 'medium', color: { rgb: THICK } } } })),
  ]);
  rows.push(Array.from({ length: colCount }, () => cell('', {})));

  // 그룹 헤더(승선 IN / 하선 OUT)
  rows.push([
    cell('', {}),
    cell('신규 승선 (IN)', {
      font: { bold: true, sz: 12, color: { rgb: HEADER_FG_BOARD } },
      fill: { fgColor: { rgb: HEADER_BG_BOARD } },
      alignment: { horizontal: 'center' },
      border: border({ thickTop: true, thickLeft: true }),
    }),
    ...Array.from({ length: 3 }, () => cell('', {
      font: { bold: true, sz: 12, color: { rgb: HEADER_FG_BOARD } },
      fill: { fgColor: { rgb: HEADER_BG_BOARD } },
      border: border({ thickTop: true }),
    })),
    cell('기존 하선 (OUT)', {
      font: { bold: true, sz: 12, color: { rgb: HEADER_FG_DISEMBARK } },
      fill: { fgColor: { rgb: HEADER_BG_DISEMBARK } },
      alignment: { horizontal: 'center' },
      border: border({ thickTop: true, thickLeft: true }),
    }),
    ...Array.from({ length: 3 }, () => cell('', {
      font: { bold: true, sz: 12, color: { rgb: HEADER_FG_DISEMBARK } },
      fill: { fgColor: { rgb: HEADER_BG_DISEMBARK } },
      border: border({ thickTop: true, thickRight: true }),
    })),
  ]);

  // 컬럼 헤더
  rows.push(COL_LABELS.map((label, i) => cell(label, {
    font: { bold: true, sz: BASE_SZ, color: { rgb: i === 0 ? '333333' : i <= 4 ? HEADER_FG_BOARD : HEADER_FG_DISEMBARK } },
    fill: { fgColor: { rgb: i === 0 ? 'F3F4F6' : i <= 4 ? HEADER_BG_BOARD : HEADER_BG_DISEMBARK } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: border({ thickBottom: true, thickLeft: i === 0 || i === 5, thickRight: i === colCount - 1 }),
  })));

  // 데이터
  plan.assignments.forEach((a, i) => {
    const zebraFill = i % 2 === 1 ? { fgColor: { rgb: ZEBRA_BG } } : undefined;
    const isLastRow = i === plan.assignments.length - 1;
    const boardRank = a.on_crew_id ? `${a.on_rank_code || ''}${a.on_rank_grade ? `(${a.on_rank_grade})` : ''}` : '';
    const values = [
      i + 1,
      boardRank,
      a.on_crew_id ? (a.on_crew_name || '') : '승선 없음',
      a.on_crew_id ? (a.on_departure_date || '-') : '',
      a.on_crew_id ? (a.embark_date || '-') : '',
      a.off_crew_id ? `${a.off_rank_code || ''}${a.off_rank_grade ? `(${a.off_rank_grade})` : ''}` : '',
      a.off_crew_id ? (a.off_crew_name || '') : '하선 없음',
      a.off_crew_id ? (a.off_disembark_date || '-') : '',
      a.off_crew_id ? (a.off_return_date || '-') : '',
    ];
    rows.push(values.map((v, c) => cell(v, {
      font: { sz: BASE_SZ, bold: c === 2 || c === 6, italic: (c >= 1 && c <= 4 && !a.on_crew_id) || (c >= 5 && c <= 8 && !a.off_crew_id) },
      color: (c >= 1 && c <= 4 && !a.on_crew_id) || (c >= 5 && c <= 8 && !a.off_crew_id) ? { rgb: 'AAAAAA' } : undefined,
      fill: zebraFill,
      alignment: { horizontal: COL_ALIGN[c], vertical: 'center' },
      border: border({ thickBottom: isLastRow, thickLeft: c === 0 || c === 5, thickRight: c === colCount - 1 }),
    })));
  });

  if (plan.notes) {
    rows.push(Array.from({ length: colCount }, () => cell('', {})));
    rows.push([
      cell(`비고: ${plan.notes}`, { font: { sz: BASE_SZ, color: { rgb: '444444' } } }),
      ...Array.from({ length: colCount - 1 }, () => cell('', {})),
    ]);
  }

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet['!cols'] = [{ wch: 5 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 12 }];
  worksheet['!rows'] = [{ hpt: 24 }, { hpt: 16 }, { hpt: 16 }, { hpt: 6 }, { hpt: 20 }, { hpt: 20 }];
  worksheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: colCount - 1 } },
    { s: { r: 4, c: 1 }, e: { r: 4, c: 4 } },
    { s: { r: 4, c: 5 }, e: { r: 4, c: 8 } },
  ];
  return worksheet;
}

async function writeWorkbook(workbook: XLSX.WorkBook, fileName: string): Promise<void> {
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
    }
  }
  XLSX.writeFile(workbook, fileName);
}

// 배승계획서 엑셀 내보내기(단건) — 좌: 신규 승선(IN), 우: 기존 하선(OUT)
export async function exportRotationPlanToExcel(
  plan: CrewRotationPlanWithDetails & { creator_name?: string },
  portLabel?: string
): Promise<void> {
  const worksheet = buildRotationPlanWorksheet(plan, portLabel);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '배승계획서');
  await writeWorkbook(workbook, `${plan.ship_name}_배승계획서_${plan.rotation_date}.xlsx`);
}

// Excel 시트명 제약(31자, \ / * ? : [ ] 금지)에 맞춰 정리하고, 중복되면 번호를 붙인다
function sanitizeSheetName(name: string, usedNames: Set<string>): string {
  let base = name.replace(/[\\/*?:[\]]/g, '').slice(0, 28) || '계획';
  let candidate = base;
  let n = 2;
  while (usedNames.has(candidate)) {
    candidate = `${base}(${n})`;
    n++;
  }
  usedNames.add(candidate);
  return candidate;
}

// 월별 배승계획서 엑셀 내보내기 — 해당 월에 교대일이 속한 모든 선박의 계획을 한 워크북에
// 선박(계획)별 시트로 담는다. 각 시트 내용/서식은 단건 내보내기와 동일하다.
export async function exportMonthlyRotationPlansToExcel(
  plans: (CrewRotationPlanWithDetails & { creator_name?: string })[],
  month: string, // 'YYYY-MM'
  portLabelByPlanId: Map<string, string>
): Promise<void> {
  if (plans.length === 0) return;
  const workbook = XLSX.utils.book_new();
  const usedNames = new Set<string>();
  // 선박명 기준 정렬 후 시트로 추가
  const sorted = [...plans].sort((a, b) => a.ship_name.localeCompare(b.ship_name));
  for (const plan of sorted) {
    const worksheet = buildRotationPlanWorksheet(plan, portLabelByPlanId.get(plan.id));
    const sheetName = sanitizeSheetName(plan.ship_name || plan.plan_name, usedNames);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  }
  const [y, m] = month.split('-');
  await writeWorkbook(workbook, `${y}년${m}월_배승계획서_전체.xlsx`);
}
