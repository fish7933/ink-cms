import { useState, useEffect, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/store';
import { getShipCrewRoster, type ShipCrewRosterEntry } from '@/services/ship-crew-roster.service';
import { getNationalities } from '@/services/nationality.service';
import type { Nationality } from '@/types/nationality';
import ShipCrewListTable from '@/components/ship/ShipCrewListTable';

interface ShipIdentity {
  name: string;
  imo_number?: string;
  call_sign?: string;
  flag?: string;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// 사이드바/헤더/탭바 없이 순수 문서만 렌더링되는 독립 인쇄 페이지 (App.tsx 최상위 라우트, Layout 우회)
// 국제표준(영문) Crew List — 모달 대신 별도 페이지/탭에서 열려 인쇄 후 닫아도 앱 상태에 영향 없음
export default function ShipCrewListPrintPage() {
  const { shipId } = useParams<{ shipId: string }>();
  const [searchParams] = useSearchParams();
  const date = searchParams.get('date') || todayISO();

  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [ship, setShip] = useState<ShipIdentity | null>(null);
  const [roster, setRoster] = useState<ShipCrewRosterEntry[]>([]);
  const [nationalities, setNationalities] = useState<Nationality[]>([]);

  useEffect(() => {
    const load = async () => {
      if (!shipId) return;
      const user = await getCurrentUser();
      if (!user) { setUnauthorized(true); setLoading(false); return; }
      const [{ data: shipData }, rosterData, nationalityData] = await Promise.all([
        supabase.from('ships').select('name, imo_number, call_sign, flag').eq('id', shipId).single(),
        getShipCrewRoster(shipId, date),
        getNationalities(),
      ]);
      setShip(shipData || null);
      setRoster(rosterData);
      setNationalities(nationalityData);
      setLoading(false);
    };
    load();
  }, [shipId, date]);

  const nationalityLabelEn = useMemo(() => {
    const byCode = new Map(nationalities.map(n => [n.country_code, n.country_name_en]));
    const byKoName = new Map(nationalities.map(n => [n.country_name_ko, n.country_name_en]));
    return (value: string) => byCode.get(value) || byKoName.get(value) || value;
  }, [nationalities]);

  if (loading) {
    return <div style={{ padding: 40, fontSize: 14, color: '#666' }}>Loading...</div>;
  }
  if (unauthorized) {
    return <div style={{ padding: 40, fontSize: 14, color: '#666' }}>Login required.</div>;
  }
  if (!ship) {
    return <div style={{ padding: 40, fontSize: 14, color: '#666' }}>Ship not found.</div>;
  }

  return (
    <div style={{ padding: '28px 36px 48px' }}>
      <style>{`
        @page { size: A4 landscape; margin: 10mm; }
        @media print {
          .print-actions { display: none !important; }
          .crew-list-print-table { table-layout: fixed; width: 100%; font-size: 9px !important; }
          .crew-list-print-table th, .crew-list-print-table td { padding: 3px 4px !important; white-space: normal !important; word-break: break-word; }
          .crew-list-print-table tr { break-inside: avoid; page-break-inside: avoid; }
          .crew-list-print-table thead { display: table-header-group; }
        }
      `}</style>
      <div className="print-actions" style={{ marginBottom: 20, textAlign: 'right' }}>
        <button
          onClick={() => window.print()}
          style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, cursor: 'pointer' }}
        >
          Print / Save as PDF
        </button>
      </div>
      <div className="space-y-3">
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '0.05em' }}>Crew List</h2>
        </div>
        <div className="grid grid-cols-4 gap-x-4 gap-y-1 text-xs border rounded-md p-3">
          <div><span className="text-gray-400">Ship Name</span><div className="font-medium">{ship.name}</div></div>
          <div><span className="text-gray-400">IMO No.</span><div className="font-medium">{ship.imo_number || '-'}</div></div>
          <div><span className="text-gray-400">Call Sign</span><div className="font-medium">{ship.call_sign || '-'}</div></div>
          <div><span className="text-gray-400">Flag</span><div className="font-medium">{ship.flag || '-'}</div></div>
          <div className="col-span-4"><span className="text-gray-400">Date</span><div className="font-medium">{date}</div></div>
        </div>
        <ShipCrewListTable roster={roster} nationalityLabel={nationalityLabelEn} />
        <div className="pt-6 text-xs text-gray-500">Date & Signature (Master/Agent)</div>
      </div>
    </div>
  );
}
