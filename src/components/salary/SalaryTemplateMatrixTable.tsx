import type { SalaryTemplateWithItems, SalaryComponent } from '@/lib/salary-store';
import type { Rank } from '@/types/models';

interface SalaryTemplateMatrixTableProps {
  template: SalaryTemplateWithItems;
  components: SalaryComponent[];
  ranks: Rank[];
}

/**
 * 직급/등급별 급여 현황 읽기 전용 표. SalaryTemplateViewDialog, SalaryTemplateDetailPage,
 * SalaryTemplateFormPage(갱신 히스토리)에서 공용으로 사용.
 */
export default function SalaryTemplateMatrixTable({ template, components, ranks }: SalaryTemplateMatrixTableProps) {
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
    return <p className="text-xs text-gray-400 py-4 text-center">등록된 직급 없음</p>;
  }

  return (
    <div className="overflow-auto border rounded">
      <table className="text-xs w-full bg-white">
        <thead>
          <tr className="bg-gray-50 border-b">
            <th className="sticky left-0 bg-gray-50 border-r p-1" />
            {earningIds.length > 0 && (
              <th colSpan={earningIds.length} className="text-center py-1 px-2 text-blue-700 font-semibold border-r bg-blue-50/50">
                급여 구성 항목
              </th>
            )}
            {deductionIds.length > 0 && (
              <th colSpan={deductionIds.length} className="text-center py-1 px-2 text-red-600 font-semibold border-r bg-red-50/50">
                공제 항목
              </th>
            )}
            <th colSpan={2} className="text-center py-1 px-2 text-gray-600 font-semibold bg-gray-100">계산 결과</th>
          </tr>
          <tr className="bg-gray-100">
            <th className="text-left p-2 border-r font-semibold sticky left-0 bg-gray-100">직급</th>
            {orderedComps.map(comp => {
              const isDeduction = comp.component_type === 'deduction';
              const isDeferred = !isDeduction && comp.payment_type === 'deferred';
              return (
                <th key={comp.id} className={`text-right p-2 border-r font-semibold min-w-24 ${isDeduction ? 'text-red-600' : isDeferred ? 'text-amber-700' : ''}`}>
                  {comp.name}
                  {isDeduction && <span className="block text-[10px] font-normal text-red-400">공제</span>}
                  {isDeferred && <span className="block text-[10px] font-normal text-amber-500">후불</span>}
                </th>
              );
            })}
            <th className="text-right p-2 font-semibold min-w-20 border-l-2 border-l-gray-300">
              <div className="text-[10px] font-bold text-gray-500">TW</div><div>월 총액</div>
            </th>
            <th className="text-right p-2 font-semibold min-w-20 text-blue-700 bg-blue-50">
              <div className="text-[10px] font-bold text-blue-500">AW</div><div>월 실지급액</div>
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
                  {orderedComps.map(comp => {
                    const item = findItem(comp.id);
                    const isDeduction = comp.component_type === 'deduction';
                    return (
                      <td key={comp.id} className={`p-2 border-r text-right ${isDeduction ? 'text-red-600 bg-red-50/20' : ''}`}>
                        {item ? item.amount.toLocaleString() : '-'}
                      </td>
                    );
                  })}
                  <td className="p-2 text-right font-semibold border-l-2 border-l-gray-300 bg-gray-50">{earningTotal.toLocaleString()}</td>
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
