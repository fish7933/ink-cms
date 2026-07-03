import * as XLSX from 'xlsx';
import type { SalaryTemplateWithItems, SalaryComponent } from '@/lib/salary-store';
import type { Rank } from '@/types/models';

export function exportSalaryTemplateToExcel(
  template: SalaryTemplateWithItems,
  components: SalaryComponent[],
  ranks: Rank[],
): void {
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

  const aoa: (string | number)[][] = [];
  aoa.push([template.name]);
  aoa.push([`통화: ${template.currency}`]);
  aoa.push([`유효기간: ${template.effective_from} ~ ${template.effective_until || '현재'}`]);
  aoa.push([]);

  aoa.push([
    '직급',
    ...orderedComps.map(c => c.name + (c.component_type === 'deduction' ? ' (공제)' : '')),
    'TW (월 총액)',
    'AW (월 실지급액)',
  ]);

  for (const rank of template.ranks) {
    const grades = gradesForRank(rank);
    const gradeRows: (string | null)[] = grades.length ? grades : [null];
    for (const grade of gradeRows) {
      const findItem = (compId: string) =>
        template.items.find(i => i.rank === rank && i.component_id === compId && (i.rank_grade || null) === grade);
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

      const rankLabel = grade ? `${rankCodeOf(rank)} (${grade})` : rankCodeOf(rank);
      aoa.push([
        rankLabel,
        ...orderedComps.map(comp => findItem(comp.id)?.amount || 0),
        earningTotal,
        earningTotal - deferred - deduction,
      ]);
    }
  }

  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  worksheet['!cols'] = [{ wch: 16 }, ...orderedComps.map(() => ({ wch: 14 })), { wch: 14 }, { wch: 16 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Wage Table');
  XLSX.writeFile(workbook, `${template.name}_${template.effective_from}.xlsx`);
}
