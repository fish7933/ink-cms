import type { ShipCrewRosterEntry } from '@/services/ship-crew-roster.service';

interface ShipCrewListTableProps {
  roster: ShipCrewRosterEntry[];
  nationalityLabel?: (code: string) => string;
}

// 승선 현황 인쇄/엑셀 전용 서식: 직급/이름/국적/생년월일/선원수첩번호/여권번호/여권 발급일/여권 만료일/승선일/하선(예정)일
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
            <th className="px-2 py-1.5 text-left font-medium text-gray-500">직급</th>
            <th className="px-2 py-1.5 text-left font-medium text-gray-500">이름</th>
            <th className="px-2 py-1.5 text-left font-medium text-gray-500">국적</th>
            <th className="px-2 py-1.5 text-left font-medium text-gray-500">생년월일</th>
            <th className="px-2 py-1.5 text-left font-medium text-gray-500">선원수첩번호</th>
            <th className="px-2 py-1.5 text-left font-medium text-gray-500">여권번호</th>
            <th className="px-2 py-1.5 text-left font-medium text-gray-500">여권 발급일</th>
            <th className="px-2 py-1.5 text-left font-medium text-gray-500">여권 만료일</th>
            <th className="px-2 py-1.5 text-left font-medium text-gray-500">승선일</th>
            <th className="px-2 py-1.5 text-left font-medium text-gray-500">하선(예정)일</th>
          </tr>
        </thead>
        <tbody>
          {roster.map((entry, i) => (
            <tr key={entry.record_id} className="border-b">
              <td className="px-2 py-1.5 text-center text-gray-400">{i + 1}</td>
              <td className="px-2 py-1.5">{entry.rank}{entry.rank_grade ? `(${entry.rank_grade})` : ''}</td>
              <td className="px-2 py-1.5 font-medium">{entry.crew_name}</td>
              <td className="px-2 py-1.5">{entry.nationality ? (nationalityLabel?.(entry.nationality) || entry.nationality) : '-'}</td>
              <td className="px-2 py-1.5">{entry.date_of_birth || '-'}</td>
              <td className="px-2 py-1.5">{entry.seaman_book_number || '-'}</td>
              <td className="px-2 py-1.5">{entry.passport_number || '-'}</td>
              <td className="px-2 py-1.5">{entry.passport_issue_date || '-'}</td>
              <td className="px-2 py-1.5">{entry.passport_expiry || '-'}</td>
              <td className="px-2 py-1.5">{entry.sign_on_date}</td>
              <td className="px-2 py-1.5">
                {entry.sign_off_date || <span className="text-blue-600">승선 중</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
