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

const COL_LABELS = ['No.', 'Rank', 'Name', 'Departure', 'Boarding', 'Rank', 'Name', 'Disembark', 'Return'];
const COL_ALIGN: ('center' | 'left')[] = ['center', 'center', 'left', 'center', 'center', 'center', 'left', 'center', 'center'];

// 배승계획서 한 건의 워크시트를 만든다 — 좌: 신규 승선(IN), 우: 기존 하선(OUT). 단건 내보내기 전용.
function buildRotationPlanWorksheet(plan: CrewRotationPlanWithDetails & { creator_name?: string }, portLabel?: string) {
  const colCount = COL_LABELS.length;
  const rows: ReturnType<typeof cell>[][] = [];

  // 제목
  rows.push([
    cell('CREW DISPATCH PLAN', { font: { bold: true, sz: 16 }, alignment: { horizontal: 'center' } }),
    ...Array.from({ length: colCount - 1 }, () => cell('', {})),
  ]);
  // 메타정보
  const metaLine1 = `Plan: ${plan.plan_name}   |   Vessel: ${plan.ship_name}   |   Owner/Fleet: ${plan.owner_name}${plan.fleet_name ? ` / ${plan.fleet_name}` : ''}`;
  const metaLine2 = `Rotation Date: ${plan.rotation_date}   |   Port: ${portLabel || '-'}   |   Prepared By: ${plan.creator_name || '-'}`;
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

// 배승계획서 엑셀 내보내기(단건, 계획 상세 화면 전용) — 좌: 신규 승선(IN), 우: 기존 하선(OUT)
export async function exportRotationPlanToExcel(
  plan: CrewRotationPlanWithDetails & { creator_name?: string },
  portLabel?: string
): Promise<void> {
  const worksheet = buildRotationPlanWorksheet(plan, portLabel);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '배승계획서');
  await writeWorkbook(workbook, `${plan.ship_name}_배승계획서_${plan.rotation_date}.xlsx`);
}

// ── 배승 계획 목록(여러 건을 한 표로) ──────────────────────────────────────
// 여러 달을 고르거나 목록에서 직접 선택한 계획들을 하나의 표로 내보낼 때 쓰는 형태.
// 선주/선박 기준으로 묶어 같은 선박끼리는 셀을 병합한다.

export interface LedgerRow {
  ownerName: string;
  shipName: string;
  no: number;
  boarding: string;
  disembark: string;
  rotationDate: string;
  portLabel: string;
  notes: string;
  ownerGroupStart: boolean; // 이 행이 선주 그룹(선박이 달라도 선주가 같으면 이어짐)의 첫 행인지
  ownerGroupSize: number;   // ownerGroupStart일 때만 의미 있음
  shipGroupStart: boolean;  // 이 행이 (선주,선박) 그룹의 첫 행인지
  shipGroupSize: number;    // shipGroupStart일 때만 의미 있음
  planGroupStart: boolean;  // 이 행이 하나의 교대 계획(같은 계획의 여러 승선/하선 배정) 그룹의 첫 행인지
  planGroupSize: number;    // planGroupStart일 때만 의미 있음 — 비고는 계획 단위라 이 범위로 병합
}

type FlatRow = Omit<LedgerRow, 'ownerGroupStart' | 'ownerGroupSize' | 'shipGroupStart' | 'shipGroupSize' | 'planGroupStart' | 'planGroupSize'> & { planId: string };

// plans(계획 단위)를 선주>선박>교대일 순으로 정렬한 뒤, 계획별 배정(승선/하선 쌍)을 한 행씩 펼친다.
// 비고는 배정(승선/하선 쌍) 각각의 것이 아니라 교대 계획 자체의 비고이므로, 계획당 한 번만 값을
// 갖고 같은 계획에 속한 행끼리는 병합해서 보여준다(선주/선박과 같은 방식, 그룹 단위만 다름).
export function buildRotationPlanLedgerRows(
  plans: CrewRotationPlanWithDetails[],
  portLabelByPlanId: Map<string, string>
): LedgerRow[] {
  const sorted = [...plans].sort((a, b) =>
    a.owner_name.localeCompare(b.owner_name) ||
    a.ship_name.localeCompare(b.ship_name) ||
    a.rotation_date.localeCompare(b.rotation_date)
  );

  const flat: FlatRow[] = [];
  let no = 1;
  for (const plan of sorted) {
    const portLabel = portLabelByPlanId.get(plan.id) || '-';
    const assignments = plan.assignments.length > 0 ? plan.assignments : [null];
    for (const a of assignments) {
      const boarding = a?.on_crew_id ? `${a.on_rank_code || ''}${a.on_rank_grade ? `(${a.on_rank_grade})` : ''} ${a.on_crew_name || ''}`.trim() : '-';
      const disembark = a?.off_crew_id ? `${a.off_rank_code || ''}${a.off_rank_grade ? `(${a.off_rank_grade})` : ''} ${a.off_crew_name || ''}`.trim() : '-';
      flat.push({
        planId: plan.id,
        ownerName: plan.owner_name,
        shipName: plan.ship_name,
        no: no++,
        boarding,
        disembark,
        rotationDate: plan.rotation_date,
        portLabel,
        notes: plan.notes || '',
      });
    }
  }

  // 선주 연속 그룹(선박이 달라도 선주가 같으면 이어짐) > (선주,선박) 연속 그룹 > 계획 연속 그룹 순으로 계산
  const rows: LedgerRow[] = [];
  let i = 0;
  while (i < flat.length) {
    let oj = i + 1;
    while (oj < flat.length && flat[oj].ownerName === flat[i].ownerName) oj++;
    const ownerGroupSize = oj - i;

    let k = i;
    while (k < oj) {
      let sj = k + 1;
      while (sj < oj && flat[sj].shipName === flat[k].shipName) sj++;
      const shipGroupSize = sj - k;

      let p = k;
      while (p < sj) {
        let pj = p + 1;
        while (pj < sj && flat[pj].planId === flat[p].planId) pj++;
        const planGroupSize = pj - p;
        for (let m = p; m < pj; m++) {
          const { planId: _planId, ...row } = flat[m];
          rows.push({
            ...row,
            ownerGroupStart: m === i,
            ownerGroupSize: m === i ? ownerGroupSize : 0,
            shipGroupStart: m === k,
            shipGroupSize: m === k ? shipGroupSize : 0,
            planGroupStart: m === p,
            planGroupSize: m === p ? planGroupSize : 0,
          });
        }
        p = pj;
      }
      k = sj;
    }
    i = oj;
  }
  return rows;
}

// 배승 계획 목록 엑셀 내보내기 — 선주/선박/번호/승선자/하선자/교대일/교대국가·도시(항구)/비고,
// 같은 선박끼리는 선주/선박 셀을 병합한다.
export async function exportRotationPlansLedgerToExcel(
  plans: CrewRotationPlanWithDetails[],
  portLabelByPlanId: Map<string, string>,
  fileNameHint: string
): Promise<void> {
  const ledgerRows = buildRotationPlanLedgerRows(plans, portLabelByPlanId);
  if (ledgerRows.length === 0) return;

  const LABELS = ['Owner', 'Vessel', 'No.', 'On-Signer', 'Off-Signer', 'Rotation Date', 'Port (Country/City)', 'Remarks'];
  const colCount = LABELS.length;
  const rows: ReturnType<typeof cell>[][] = [];

  rows.push([
    cell('CREW DISPATCH PLAN', { font: { bold: true, sz: 16 }, alignment: { horizontal: 'center' } }),
    ...Array.from({ length: colCount - 1 }, () => cell('', {})),
  ]);
  rows.push(Array.from({ length: colCount }, () => cell('', {})));

  rows.push(LABELS.map(label => cell(label, {
    font: { bold: true, sz: BASE_SZ, color: { rgb: '333333' } },
    fill: { fgColor: { rgb: 'F3F4F6' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: border({ thickTop: true, thickBottom: true }),
  })));

  // 선주 그룹별로 교차 음영 — 같은 선주 안에서는(선박이 달라도) 동일한 색으로 이어지도록 그룹 인덱스 기준
  let ownerGroupIndex = -1;
  ledgerRows.forEach((r, i) => {
    if (r.ownerGroupStart) ownerGroupIndex++;
    const zebraFill = ownerGroupIndex % 2 === 1 ? { fgColor: { rgb: ZEBRA_BG } } : undefined;
    const isLastRow = i === ledgerRows.length - 1;
    const values: (string | number)[] = [r.ownerName, r.shipName, r.no, r.boarding, r.disembark, r.rotationDate, r.portLabel, r.notes];
    rows.push(values.map((v, c) => cell(v, {
      font: { sz: BASE_SZ, bold: c === 3 || c === 4 },
      fill: zebraFill,
      alignment: { horizontal: c === 2 ? 'center' : c <= 1 ? 'center' : c === 5 ? 'center' : 'left', vertical: 'center' },
      border: border({ thickBottom: isLastRow }),
    })));
  });

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet['!cols'] = [{ wch: 16 }, { wch: 14 }, { wch: 6 }, { wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 20 }, { wch: 24 }];

  const DATA_START = 3; // 제목(0) + 빈줄(1) + 헤더(2) 다음부터 데이터
  const merges = [{ s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } }];
  ledgerRows.forEach((r, i) => {
    if (r.ownerGroupStart && r.ownerGroupSize > 1) {
      merges.push({ s: { r: DATA_START + i, c: 0 }, e: { r: DATA_START + i + r.ownerGroupSize - 1, c: 0 } });
    }
    if (r.shipGroupStart && r.shipGroupSize > 1) {
      merges.push({ s: { r: DATA_START + i, c: 1 }, e: { r: DATA_START + i + r.shipGroupSize - 1, c: 1 } });
    }
    if (r.planGroupStart && r.planGroupSize > 1) {
      // 교대일/항구는 배정(승선·하선 쌍)이 아니라 계획 단위 값이라 비고와 같은 범위로 병합한다.
      merges.push({ s: { r: DATA_START + i, c: 5 }, e: { r: DATA_START + i + r.planGroupSize - 1, c: 5 } });
      merges.push({ s: { r: DATA_START + i, c: 6 }, e: { r: DATA_START + i + r.planGroupSize - 1, c: 6 } });
      merges.push({ s: { r: DATA_START + i, c: 7 }, e: { r: DATA_START + i + r.planGroupSize - 1, c: 7 } });
    }
  });
  worksheet['!merges'] = merges;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Dispatch Plan');
  await writeWorkbook(workbook, `${fileNameHint}_Dispatch_Plan.xlsx`);
}
