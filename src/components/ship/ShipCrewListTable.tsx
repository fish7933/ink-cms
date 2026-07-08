import type { ShipCrewRosterEntry } from '@/services/ship-crew-roster.service';

interface ShipCrewListTableProps {
  roster: ShipCrewRosterEntry[];
  nationalityLabel?: (code: string) => string;
}

// IMO FAL Form 5 (Crew List) 표준 서식 — 인쇄/엑셀 전용. 헤더가 가로로 길어지지 않도록 약어 사용.
export default function ShipCrewListTable({ roster, nationalityLabel }: ShipCrewListTableProps) {
  if (roster.length === 0) {
    return <div className="rounded-md border py-10 text-center text-sm text-gray-400">해당 기준일에 승선 중인 선원이 없습니다</div>;
  }

  return (
    <div className="border rounded-md overflow-hidden overflow-x-auto">
      <table className="w-full text-xs whitespace-nowrap">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="w-10 px-2 py-1.5 text-center font-medium text-gray-500">No.</th>
            <th className="px-2 py-1.5 text-left font-medium text-gray-500">Family</th>
            <th className="px-2 py-1.5 text-left font-medium text-gray-500">Given</th>
            <th className="px-2 py-1.5 text-left font-medium text-gray-500">Rank</th>
            <th className="px-2 py-1.5 text-left font-medium text-gray-500">Nat'lty</th>
            <th className="px-2 py-1.5 text-left font-medium text-gray-500">DOB</th>
            <th className="px-2 py-1.5 text-left font-medium text-gray-500">POB</th>
            <th className="px-2 py-1.5 text-left font-medium text-gray-500">ID Type</th>
            <th className="px-2 py-1.5 text-left font-medium text-gray-500">ID No.</th>
            <th className="px-2 py-1.5 text-left font-medium text-gray-500">ID Expiry</th>
            <th className="px-2 py-1.5 text-left font-medium text-gray-500">Sign-on</th>
            <th className="px-2 py-1.5 text-left font-medium text-gray-500">Exp. Sign-off</th>
          </tr>
        </thead>
        <tbody>
          {roster.map((entry, i) => (
            <tr key={entry.record_id} className="border-b">
              <td className="px-2 py-1.5 text-center text-gray-400">{i + 1}</td>
              <td className="px-2 py-1.5 font-medium">{entry.family_name}</td>
              <td className="px-2 py-1.5">{entry.given_names || '-'}</td>
              <td className="px-2 py-1.5">{entry.rank}{entry.rank_grade ? `(${entry.rank_grade})` : ''}</td>
              <td className="px-2 py-1.5">{entry.nationality ? (nationalityLabel?.(entry.nationality) || entry.nationality) : '-'}</td>
              <td className="px-2 py-1.5">{entry.date_of_birth || '-'}</td>
              <td className="px-2 py-1.5">{entry.place_of_birth || '-'}</td>
              <td className="px-2 py-1.5">{entry.id_document_nature || '-'}</td>
              <td className="px-2 py-1.5">{entry.id_document_number || '-'}</td>
              <td className="px-2 py-1.5">{entry.id_document_expiry || '-'}</td>
              <td className="px-2 py-1.5">{entry.sign_on_date}</td>
              <td className="px-2 py-1.5">
                {entry.sign_off_date || <span className="text-blue-600">On board</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
