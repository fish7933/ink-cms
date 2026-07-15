import type { EmployeePayslipItem, EmployeeSalaryItemCategory } from '@/types/employee-salary';

// 실제 회사 급여명세서 양식(고정급여/수당/비과세/기타급여/공제)에 맞춰 "보여주기만" 그룹핑한다.
// DB 카테고리는 그대로 base/allowance/deduction 3개를 유지하고(스키마 변경 없음), allowance
// 항목은 이름으로 수당/비과세/기타급여 중 어디에 속하는지 판별한다 — 셋 중 어디에도 없는
// 이름(담당자가 새로 만든 커스텀 항목)은 "수당"으로 묶인다.
const NONTAX_NAMES = new Set(['식대', '차량유지비', '해외출장일비']);
const OTHER_PAY_NAMES = new Set(['근태공제', '경영성과급', '생일축하금']);

export interface PayslipGroup {
  key: string;
  label: string;
  items: EmployeePayslipItem[];
}

function groupLabelForItem(item: { category: EmployeeSalaryItemCategory; name: string }): { key: string; label: string } {
  if (item.category === 'base') return { key: 'fixed', label: '고정급여' };
  if (item.category === 'deduction') return { key: 'deduction', label: '공제' };
  if (NONTAX_NAMES.has(item.name)) return { key: 'nontax', label: '비과세' };
  if (OTHER_PAY_NAMES.has(item.name)) return { key: 'other', label: '기타급여' };
  return { key: 'variable', label: '수당' };
}

const GROUP_ORDER = ['fixed', 'variable', 'nontax', 'other', 'deduction'];

// 지급/공제 항목을 양식과 같은 순서(고정급여 → 수당 → 비과세 → 기타급여 → 공제)의 그룹으로 묶는다.
export function groupPayslipItems(items: EmployeePayslipItem[]): PayslipGroup[] {
  const byKey = new Map<string, PayslipGroup>();
  for (const item of items) {
    const { key, label } = groupLabelForItem(item);
    if (!byKey.has(key)) byKey.set(key, { key, label, items: [] });
    byKey.get(key)!.items.push(item);
  }
  return GROUP_ORDER.map(key => byKey.get(key)).filter((g): g is PayslipGroup => !!g && g.items.length > 0);
}

export function isDeductionGroup(group: PayslipGroup): boolean {
  return group.key === 'deduction';
}
