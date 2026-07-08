import * as XLSX from 'xlsx-js-style';
import type { ShipCrewRosterEntry } from '@/services/ship-crew-roster.service';

interface SaveFilePickerWindow extends Window {
  showSaveFilePicker?: (options: {
    suggestedName?: string;
    types?: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<{
    createWritable: () => Promise<{ write: (data: BlobPart) => Promise<void>; close: () => Promise<void> }>;
  }>;
}

export interface ShipIdentity {
  shipName: string;
  imoNumber?: string;
  callSign?: string;
  flag?: string;
}

const HEADER_BG = 'E0E7FF';
const HEADER_FG = '3730A3';
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

const HEADER_LABELS = ['No.', '직급', '이름', '국적', '생년월일', '선원수첩번호', '여권번호', '여권 발급일', '여권 만료일', '승선일', '하선(예정)일'];
const COL_ALIGN: ('center' | 'left' | 'right')[] = ['center', 'center', 'left', 'center', 'center', 'center', 'center', 'center', 'center', 'center', 'center'];

// 승선 현황 엑셀 내보내기: 직급/이름/국적/생년월일/선원수첩번호/여권번호/여권 발급일/여권 만료일/승선일/하선(예정)일
export async function exportShipCrewRosterToExcel(
  ship: ShipIdentity,
  date: string,
  roster: ShipCrewRosterEntry[],
  nationalityLabel?: (code: string) => string
): Promise<void> {
  const colCount = HEADER_LABELS.length;
  const rows: ReturnType<typeof cell>[][] = [];

  // 제목
  rows.push([
    cell(`${ship.shipName} 승선 현황`, { font: { bold: true, sz: 14 }, alignment: { horizontal: 'center' } }),
    ...Array.from({ length: colCount - 1 }, () => cell('', {})),
  ]);
  // 부제(선박 식별정보)
  rows.push([
    cell(
      `IMO ${ship.imoNumber || '-'}   |   Call Sign ${ship.callSign || '-'}   |   선적 ${ship.flag || '-'}   |   기준일 ${date}`,
      { font: { sz: BASE_SZ, color: { rgb: '666666' } }, alignment: { horizontal: 'center' }, border: { bottom: { style: 'medium', color: { rgb: THICK } } } }
    ),
    ...Array.from({ length: colCount - 1 }, () => cell('', { border: { bottom: { style: 'medium', color: { rgb: THICK } } } })),
  ]);
  rows.push(Array.from({ length: colCount }, () => cell('', {})));

  // 헤더
  rows.push(HEADER_LABELS.map((label, i) => cell(label, {
    font: { bold: true, sz: BASE_SZ, color: { rgb: HEADER_FG } },
    fill: { fgColor: { rgb: HEADER_BG } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: border({ thickTop: true, thickBottom: true, thickLeft: i === 0, thickRight: i === colCount - 1 }),
  })));

  // 데이터
  roster.forEach((r, i) => {
    const zebraFill = i % 2 === 1 ? { fgColor: { rgb: ZEBRA_BG } } : undefined;
    const values = [
      i + 1,
      r.rank_grade ? `${r.rank}(${r.rank_grade})` : r.rank,
      r.crew_name,
      r.nationality ? (nationalityLabel?.(r.nationality) || r.nationality) : '',
      r.date_of_birth || '',
      r.seaman_book_number || '',
      r.passport_number || '',
      r.passport_issue_date || '',
      r.passport_expiry || '',
      r.sign_on_date,
      r.sign_off_date || '',
    ];
    const isLastRow = i === roster.length - 1;
    rows.push(values.map((v, c) => cell(v, {
      font: { sz: BASE_SZ, bold: c === 2 },
      fill: zebraFill,
      alignment: { horizontal: COL_ALIGN[c], vertical: 'center' },
      border: border({ thickBottom: isLastRow, thickLeft: c === 0, thickRight: c === colCount - 1 }),
    })));
  });

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet['!cols'] = [{ wch: 5 }, { wch: 10 }, { wch: 14 }, { wch: 8 }, { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }];
  worksheet['!rows'] = [{ hpt: 22 }, { hpt: 16 }, { hpt: 6 }, { hpt: 20 }];
  worksheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '승선현황');
  const fileName = `${ship.shipName}_승선현황_${date}.xlsx`;

  // 지원 브라우저(Chrome/Edge)에서는 저장 위치/파일명을 직접 고를 수 있는 대화창을 띄운다.
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
