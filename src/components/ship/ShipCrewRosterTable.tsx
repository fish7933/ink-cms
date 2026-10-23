import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import en from '@/i18n/locales/components/ShipCrewRosterTable/en.json';
import type { ShipCrewRosterEntry } from '@/services/ship-crew-roster.service';

i18n.addResourceBundle('en', 'ShipCrewRosterTable', en, true, true);

interface ShipCrewRosterTableProps {
  roster: ShipCrewRosterEntry[];
  nationalityLabel?: (code: string) => string;
}

export default function ShipCrewRosterTable({ roster, nationalityLabel }: ShipCrewRosterTableProps) {
  const { t } = useTranslation('ShipCrewRosterTable');
  if (roster.length === 0) {
    return <div className="rounded-md border py-10 text-center text-sm text-gray-400">{t('해당 기준일에 승선 중인 선원이 없습니다')}</div>;
  }

  return (
    <div className="border rounded-md overflow-hidden overflow-x-auto no-scrollbar">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="w-10 px-3 py-2 text-center text-xs font-medium text-gray-400">#</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">{t('이름')}</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">{t('국적')}</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">{t('직급')}</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">{t('승선일')}</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">{t('하선일')}</th>
          </tr>
        </thead>
        <tbody>
          {roster.map((entry, i) => (
            <tr key={entry.record_id} className="border-b">
              <td className="px-3 py-2 text-center text-xs text-gray-400">{i + 1}</td>
              <td className="px-3 py-2 font-medium">{entry.crew_name}</td>
              <td className="px-3 py-2 text-gray-600">{entry.nationality ? (nationalityLabel?.(entry.nationality) || entry.nationality) : '-'}</td>
              <td className="px-3 py-2 text-gray-600">{entry.rank}{entry.rank_grade ? `(${entry.rank_grade})` : ''}</td>
              <td className="px-3 py-2 text-gray-600">{entry.sign_on_date}</td>
              <td className="px-3 py-2 text-gray-600">
                {entry.sign_off_date || <span className="text-blue-600">{t('승선 중')}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
