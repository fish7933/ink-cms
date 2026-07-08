import { useEffect, useMemo, useState } from 'react';
import { Printer, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { getShipCrewRoster, type ShipCrewRosterEntry } from '@/services/ship-crew-roster.service';
import { getNationalities } from '@/services/nationality.service';
import { exportShipCrewRosterToExcel } from '@/utils/ship-crew-roster-export';
import type { Nationality } from '@/types/nationality';
import ShipCrewRosterTable from './ShipCrewRosterTable';
import ShipCrewRosterPrintDialog from './ShipCrewRosterPrintDialog';
import ShipRosterCalendar from './ShipRosterCalendar';

interface ShipCrewRosterTabProps {
  shipId?: string;
  shipName: string;
  imoNumber?: string;
  callSign?: string;
  flag?: string;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ShipCrewRosterTab({ shipId, shipName, imoNumber, callSign, flag }: ShipCrewRosterTabProps) {
  const [date, setDate] = useState(todayISO());
  const [roster, setRoster] = useState<ShipCrewRosterEntry[]>([]);
  const [nationalities, setNationalities] = useState<Nationality[]>([]);
  const [loading, setLoading] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);

  useEffect(() => {
    getNationalities().then(setNationalities).catch(console.error);
  }, []);

  useEffect(() => {
    if (!shipId) return;
    setLoading(true);
    getShipCrewRoster(shipId, date)
      .then(setRoster)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [shipId, date]);

  const nationalityLabel = useMemo(() => {
    const map = new Map(nationalities.map(n => [n.country_code, n.country_name_ko]));
    return (code: string) => map.get(code) || code;
  }, [nationalities]);

  // Crew List(인쇄/엑셀)는 국적을 한글이 아닌 국가 코드로 표기한다 — 저장값이 코드가 아니라
  // (구 데이터 등으로) 한글 국가명 그대로인 경우까지 코드로 정규화해준다.
  const nationalityCode = useMemo(() => {
    const codes = new Set(nationalities.map(n => n.country_code));
    const byKoName = new Map(nationalities.map(n => [n.country_name_ko, n.country_code]));
    return (value: string) => (codes.has(value) ? value : byKoName.get(value) || value);
  }, [nationalities]);

  if (!shipId) {
    return <p className="text-sm text-gray-400 py-8 text-center">선박을 먼저 저장한 후 승선 현황을 확인할 수 있습니다.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <Label className="text-xs">기준일 (해당 날짜에 승선 중인 선원 조회 — 파란 배경: 승선 인원 있음)</Label>
          <ShipRosterCalendar shipId={shipId} selectedDate={date} onSelectDate={setDate} />
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => exportShipCrewRosterToExcel({ shipName, imoNumber, callSign, flag }, date, roster, nationalityCode)} disabled={roster.length === 0}>
            <FileSpreadsheet className="w-3.5 h-3.5" />엑셀 저장
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => setPrintOpen(true)} disabled={roster.length === 0}>
            <Printer className="w-3.5 h-3.5" />인쇄
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" /></div>
      ) : (
        <ShipCrewRosterTable roster={roster} nationalityLabel={nationalityLabel} />
      )}

      <ShipCrewRosterPrintDialog
        open={printOpen}
        onOpenChange={setPrintOpen}
        shipName={shipName}
        imoNumber={imoNumber}
        callSign={callSign}
        flag={flag}
        date={date}
        roster={roster}
        nationalityLabel={nationalityCode}
      />
    </div>
  );
}
