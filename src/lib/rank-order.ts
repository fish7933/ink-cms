// 직급 관리(/ranks) 화면은 부서(갑판부→기관부→사주부) 그룹별로 나눠 표시하고,
// 각 부서 안에서 display_order로 정렬한다. display_order는 부서별로 재사용되는
// 값이라(부서마다 1,2,3...) DB에서 이 컬럼만으로 단순 정렬하면 부서가 뒤섞인다.
// 모든 직급 셀렉트박스는 항상 이 "직급 관리 화면과 같은 순서"를 따라야 하므로,
// ranks를 가져오는 곳에서는 항상 이 함수로 정렬해서 써야 한다.
const DEPARTMENT_ORDER: Record<string, number> = { deck: 0, engine: 1, catering: 2 };

export function sortRanksByDisplayOrder<T extends { department: string; display_order: number }>(ranks: T[]): T[] {
  return [...ranks].sort((a, b) =>
    (DEPARTMENT_ORDER[a.department] ?? 99) - (DEPARTMENT_ORDER[b.department] ?? 99) ||
    a.display_order - b.display_order
  );
}
