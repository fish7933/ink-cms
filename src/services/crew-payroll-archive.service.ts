import JSZip from 'jszip';
import * as XLSX from 'xlsx-js-style';
import { crewPayrollService } from '@/services/crew-payroll.service';
import { buildCrewPayrollFullWorkbook } from '@/utils/crew-payroll-export';

interface SaveFilePickerWindow extends Window {
  showSaveFilePicker?: (options: {
    suggestedName?: string;
    types?: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<{
    createWritable: () => Promise<{ write: (data: BlobPart) => Promise<void>; close: () => Promise<void> }>;
  }>;
}

async function writeBlobToFile(blob: Blob, fileName: string): Promise<void> {
  const picker = (window as SaveFilePickerWindow).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker({
        suggestedName: fileName,
        types: [{ description: 'ZIP Archive', accept: { 'application/zip': ['.zip'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const crewPayrollArchiveService = {
  // 선주(또는 임의의 선박 묶음) 소속 선박마다 급여대장+선원별 급여명세서가 담긴 엑셀을
  // 각각 따로 만들어 zip 하나로 묶는다 — 선박 수가 대시보드 규모(최대 200척)가 아니라
  // 한 선주 소속 규모(보통 수 척~수십 척)라 선박별로 순차 조회해도 무리 없다.
  async buildPayrollZip(
    yearMonth: string,
    ships: { ship_id: string; ship_name: string; period_id: string | null }[]
  ): Promise<{ blob: Blob; includedCount: number; skippedCount: number }> {
    const zip = new JSZip();
    let includedCount = 0;
    let skippedCount = 0;

    for (const ship of ships) {
      if (!ship.period_id) { skippedCount++; continue; }
      const [ledger, payslips] = await Promise.all([
        crewPayrollService.getPayrollLedgerForPeriod(ship.period_id),
        crewPayrollService.getPayslipsForPeriod(ship.period_id),
      ]);
      if (!ledger || ledger.rows.length === 0) { skippedCount++; continue; }
      const workbook = buildCrewPayrollFullWorkbook(ledger, payslips);
      const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const fileName = `${ship.ship_name}_${yearMonth}_Payroll.xlsx`.replace(/[/\\?%*:|"<>]/g, '');
      zip.file(fileName, buffer);
      includedCount++;
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    return { blob, includedCount, skippedCount };
  },

  async downloadPayrollZip(
    yearMonth: string,
    groupLabel: string,
    ships: { ship_id: string; ship_name: string; period_id: string | null }[]
  ): Promise<{ includedCount: number; skippedCount: number }> {
    const { blob, includedCount, skippedCount } = await this.buildPayrollZip(yearMonth, ships);
    if (includedCount > 0) {
      await writeBlobToFile(blob, `${groupLabel}_${yearMonth}_Payroll.zip`.replace(/[/\\?%*:|"<>]/g, ''));
    }
    return { includedCount, skippedCount };
  },
};
