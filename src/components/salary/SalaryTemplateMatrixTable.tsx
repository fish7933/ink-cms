import type { SalaryTemplateWithItems, SalaryComponent } from '@/lib/salary-store';
import type { Rank } from '@/types/models';

interface SalaryTemplateMatrixTableProps {
  template: SalaryTemplateWithItems;
  components: SalaryComponent[];
  ranks: Rank[];
  lang?: 'ko' | 'en';
}

const LABELS = {
  ko: { noRanks: '등록된 직급 없음', earnings: '급여 구성 항목', deductions: '공제 항목', result: '계산 결과', rank: '직급', deferred: '후불', total: '월 총액', net: '월 실지급액' },
  en: { noRanks: 'No ranks registered', earnings: 'Earnings', deductions: 'Deductions', result: 'Total', rank: 'Rank', deferred: 'Deferred', total: 'Total Wage', net: 'Net Wage' },
};

/**
 * 직급/등급별 급여 현황 읽기 전용 표. SalaryTemplateViewDialog, SalaryTemplateDetailPage,
 * SalaryTemplateFormPage(갱신 히스토리)에서는 한글로, 선주/매닝사와 공유되는 선원 급여대장
 * 화면(CrewPayrollManagementPage)에서는 lang="en"으로 영문 표기한다.
 */
export default function SalaryTemplateMatrixTable({ template, components, ranks, lang = 'ko' }: SalaryTemplateMatrixTableProps) {
  const t = LABELS[lang];
  const rankCodeOf = (rankName: string) => ranks.find(r => r.name === rankName)?.rank_code || rankName;
  const gradesForRank = (rank: string): string[] =>
    Array.from(new Set(template.items.filter(i => i.rank === rank && i.rank_grade).map(i => i.rank_grade as string))).sort();

  const earningIds = components
    .filter(c => (c.component_type ?? 'earning') === 'earning' && template.items.some(i => i.component_id === c.id))
    .map(c => c.id);
  const deductionIds = components
    .filter(c => c.component_type === 'deduction' && template.items.some(i => i.component_id === c.id))
    .map(c => c.id);
  const orderedComps = [...earningIds, ...deductionIds]
    .map(cid => components.find(c => c.id === cid))
    .filter((c): c is SalaryComponent => Boolean(c));

  if (template.ranks.length === 0) {
    return <p className="text-xs text-gray-400 py-4 text-center">{t.noRanks}</p>;
  }

  return (
    <div className="overflow-auto border rounded">
      <table className="text-xs w-full bg-white">
        <thead>
          <tr className="bg-gray-50 border-b">
            <th className="sticky left-0 bg-gray-50 border-r p-1" />
            {earningIds.length > 0 && (
              <th colSpan={earningIds.length} className="text-center py-1 px-2 text-blue-700 font-semibold border-r bg-blue-50/50">
                {t.earnings}
              </th>
            )}
            {deductionIds.length > 0 && (
              <th colSpan={deductionIds.length} className="text-center py-1 px-2 text-red-600 font-semibold border-r bg-red-50/50">
                {t.deductions}
              </th>
            )}
            <th colSpan={2} className="text-center py-1 px-2 text-gray-600 font-semibold bg-gray-100">{t.result}</th>
          </tr>
          <tr className="bg-gray-100">
            <th className="text-left p-2 border-r font-semibold sticky left-0 bg-gray-100">{t.rank}</th>
            {orderedComps.map((comp, idx) => {
              const isDeduction = comp.component_type === 'deduction';
              const isDeferred = !isDeduction && comp.payment_type === 'deferred';
              // 마지막 열은 오른쪽에 border-r을 안 준다 — 바로 옆 Total 열의 border-l과
              // 겹쳐서 선이 두 겹으로 보이는 문제를 막기 위해(Total 열의 선 하나로 충분).
              const isLast = idx === orderedComps.length - 1;
              return (
                <th key={comp.id} className={`text-right p-2 font-semibold min-w-24 ${isLast ? '' : 'border-r'} ${isDeduction ? 'text-red-600' : isDeferred ? 'text-amber-700' : ''}`}>
                  {comp.name}
                  {isDeferred && <span className="block text-[10px] font-normal text-amber-500">{t.deferred}</span>}
                </th>
              );
            })}
            <th className="text-right p-2 font-semibold min-w-20 border-l">
              <div className="text-[10px] font-bold text-gray-500">TW</div><div>{t.total}</div>
            </th>
            <th className="text-right p-2 font-semibold min-w-20 text-blue-700 bg-blue-50">
              <div className="text-[10px] font-bold text-blue-500">AW</div><div>{t.net}</div>
            </th>
          </tr>
        </thead>
        <tbody>
          {template.ranks.flatMap(r => {
            const grades = gradesForRank(r);
            const gradeRows: (string | null)[] = grades.length ? grades : [null];
            return gradeRows.map(grade => {
              const findItem = (compId: string) =>
                template.items.find(i => i.rank === r && i.component_id === compId && (i.rank_grade || null) === grade);
              const earningTotal = orderedComps.reduce((s, comp) => {
                if ((comp.component_type ?? 'earning') !== 'earning') return s;
                return s + (findItem(comp.id)?.amount || 0);
              }, 0);
              const deferred = orderedComps.reduce((s, comp) => {
                if ((comp.component_type ?? 'earning') !== 'earning' || comp.payment_type !== 'deferred') return s;
                return s + (findItem(comp.id)?.amount || 0);
              }, 0);
              const deduction = orderedComps.reduce((s, comp) => {
                if (comp.component_type !== 'deduction') return s;
                return s + (findItem(comp.id)?.amount || 0);
              }, 0);
              return (
                <tr key={`${r}::${grade || '_'}`} className="border-t">
                  <td className="p-2 border-r font-medium text-gray-700 bg-gray-50 sticky left-0">
                    <div className="flex items-center gap-1">
                      <span>{rankCodeOf(r)}</span>
                      {grade && (
                        <span className="inline-flex items-center bg-white border rounded px-1.5 py-0.5 text-[10px] text-gray-600">{grade}</span>
                      )}
                    </div>
                  </td>
                  {orderedComps.map((comp, idx) => {
                    const item = findItem(comp.id);
                    const isDeduction = comp.component_type === 'deduction';
                    const isLast = idx === orderedComps.length - 1;
                    return (
                      <td key={comp.id} className={`p-2 text-right ${isLast ? '' : 'border-r'} ${isDeduction ? 'text-red-600 bg-red-50/20' : ''}`}>
                        {item ? item.amount.toLocaleString() : '-'}
                      </td>
                    );
                  })}
                  <td className="p-2 text-right font-semibold border-l bg-gray-50">{earningTotal.toLocaleString()}</td>
                  <td className="p-2 text-right font-bold text-blue-700 bg-blue-50">{(earningTotal - deferred - deduction).toLocaleString()}</td>
                </tr>
              );
            });
          })}
        </tbody>
      </table>
    </div>
  );
}
