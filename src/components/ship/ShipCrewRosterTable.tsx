import type { ShipCrewRosterEntry } from '@/services/ship-crew-roster.service';

interface ShipCrewRosterTableProps {
  roster: ShipCrewRosterEntry[];
  nationalityLabel?: (code: string) => string;
}

// IMO FAL Form 5 (Crew List) 표준 서식의 6~17번 컬럼
export default function ShipCrewRosterTable({ roster, nationalityLabel }: ShipCrewRosterTableProps) {
  if (roster.length === 0) {
    return <div className="rounded-md border py-10 text-center text-sm text-gray-400">해당 기준일에 승선 중인 선원이 없습니다</div>;
  }

  return (
    <div className="border rounded-md overflow-hidden overflow-x-auto">
      <table className="w-full text-xs whitespace-nowrap">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="w-10 px-2 py-1.5 text-center font-medium text-gray-500">No.</th>
            <th className="px-2 py-1.5 text-left font-medium text-gray-500">Family name</th>
            <th className="px-2 py-1.5 text-left font-medium text-gray-500">Given names</th>
            <th className="px-2 py-1.5 text-left font-medium text-gray-500">Rank or rating</th>
            <th className="px-2 py-1.5 text-left font-medium text-gray-500">Nationality</th>
            <th className="px-2 py-1.5 text-left font-medium text-gray-500">Date of birth</th>
            <th className="px-2 py-1.5 text-left font-medium text-gray-500">Place of birth</th>
            <th className="px-2 py-1.5 text-left font-medium text-gray-500">Nature of ID document</th>
            <th className="px-2 py-1.5 text-left font-medium text-gray-500">No. of ID document</th>
            <th className="px-2 py-1.5 text-left font-medium text-gray-500">Expiry of ID document</th>
            <th className="px-2 py-1.5 text-left font-medium text-gray-500">Sign-on date</th>
            <th className="px-2 py-1.5 text-left font-medium text-gray-500">Expected sign-off date</th>
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
