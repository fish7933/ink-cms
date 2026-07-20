import type { SalaryTemplateWithItems, SalaryComponent } from '@/lib/salary-store';
import type { Rank } from '@/types/models';

export interface TemplateMatrixColumn {
  component_id: string;
  name: string;
  is_deduction: boolean;
}

export interface TemplateMatrixRow {
  rank_code: string;
  grade: string | null;
  amounts: (number | null)[]; // columns와 같은 순서
  total_earning: number;
  net_earning: number;
}

export interface TemplateMatrix {
  columns: TemplateMatrixColumn[];
  rows: TemplateMatrixRow[];
}

// SalaryTemplateMatrixTable(화면 표시용)과 같은 데이터 구성 로직 — 엑셀 등 React가 아닌
// 출력물에서도 같은 직급/등급별 급여 매트릭스를 재사용할 수 있도록 순수 함수로 분리했다.
// components는 활성(is_active=true) 항목만 넘겨야 개명/통합으로 남은 예전 항목이 안 섞인다.
export function buildSalaryTemplateMatrix(
  template: SalaryTemplateWithItems,
  components: SalaryComponent[],
  ranks: Rank[]
): TemplateMatrix {
  const rankCodeOf = (rankName: string) => ranks.find(r => r.name === rankName)?.rank_code || rankName;
  const gradesForRank = (rank: string): string[] =>
    Array.from(new Set(template.items.filter(i => i.rank === rank && i.rank_grade).map(i => i.rank_grade as string))).sort();

  const earningComps = components.filter(c => (c.component_type ?? 'earning') === 'earning' && template.items.some(i => i.component_id === c.id));
  const deductionComps = components.filter(c => c.component_type === 'deduction' && template.items.some(i => i.component_id === c.id));
  const orderedComps = [...earningComps, ...deductionComps];

  const columns: TemplateMatrixColumn[] = orderedComps.map(c => ({ component_id: c.id, name: c.name, is_deduction: c.component_type === 'deduction' }));

  const rows: TemplateMatrixRow[] = template.ranks.flatMap(r => {
    const grades = gradesForRank(r);
    const gradeRows: (string | null)[] = grades.length ? grades : [null];
    return gradeRows.map(grade => {
      const findItem = (compId: string) =>
        template.items.find(i => i.rank === r && i.component_id === compId && (i.rank_grade || null) === grade);
      const amounts = orderedComps.map(comp => findItem(comp.id)?.amount ?? null);
      const earningTotal = orderedComps.reduce((s, comp, idx) => ((comp.component_type ?? 'earning') === 'earning' ? s + (amounts[idx] || 0) : s), 0);
      const deferred = orderedComps.reduce((s, comp, idx) => ((comp.component_type ?? 'earning') === 'earning' && comp.payment_type === 'deferred' ? s + (amounts[idx] || 0) : s), 0);
      const deduction = orderedComps.reduce((s, comp, idx) => (comp.component_type === 'deduction' ? s + (amounts[idx] || 0) : s), 0);
      return {
        rank_code: rankCodeOf(r),
        grade,
        amounts,
        total_earning: earningTotal,
        net_earning: earningTotal - deferred - deduction,
      };
    });
  });

  return { columns, rows };
}
