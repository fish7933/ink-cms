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

// 승선 현황 엑셀 내보내기: 직급/이름/국적/생년월일/선원수첩번호/여권번호/여권 발급일/여권 만료일/승선일/하선(예정)일
export async function exportShipCrewRosterToExcel(
  ship: ShipIdentity,
  date: string,
  roster: ShipCrewRosterEntry[],
  nationalityLabel?: (code: string) => string
): Promise<void> {
  const header = ['No.', '직급', '이름', '국적', '생년월일', '선원수첩번호', '여권번호', '여권 발급일', '여권 만료일', '승선일', '하선(예정)일'];
  const rows = roster.map((r, i) => [
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
  ]);

  const worksheet = XLSX.utils.aoa_to_sheet([
    [`${ship.shipName} 승선 현황`],
    [`IMO: ${ship.imoNumber || '-'}    Call Sign: ${ship.callSign || '-'}    선적: ${ship.flag || '-'}    기준일: ${date}`],
    [],
    header,
    ...rows,
  ]);
  worksheet['!cols'] = [{ wch: 5 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }];
  worksheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: header.length - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: header.length - 1 } },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Crew List');
  const fileName = `CrewList_${ship.shipName}_${date}.xlsx`;

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
