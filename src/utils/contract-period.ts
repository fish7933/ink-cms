import type { Company, Rank } from '@/types/models';

/**
 * 선주사 관리(CompanyManagementPage.tsx)에서 설정한 기본 계약기간을 가져온다. 선박/플릿별
 * 개별 설정은 실제로 구현된 적이 없어(해당 컬럼도 없고 편집 UI도 없음) company 값만 사용한다.
 * @param rankCategory - 'officer' or 'rating'
 * @param company - Company object (required)
 * @returns Contract period in months
 */
export function calculateContractPeriod(
  rankCategory: 'officer' | 'rating',
  company: Company
): number {
  const field = rankCategory === 'officer'
    ? 'officer_contract_months'
    : 'rating_contract_months';
  return company[field] ?? 0;
}

/**
 * Get contract period options for dropdown
 */
export function getContractPeriodOptions(): { value: number; label: string }[] {
  return [
    { value: 3, label: '3개월' },
    { value: 4, label: '4개월' },
    { value: 5, label: '5개월' },
    { value: 6, label: '6개월' },
    { value: 7, label: '7개월' },
    { value: 8, label: '8개월' },
    { value: 9, label: '9개월' },
    { value: 10, label: '10개월' },
    { value: 11, label: '11개월' },
    { value: 12, label: '12개월' },
    { value: 15, label: '15개월' },
    { value: 18, label: '18개월' },
    { value: 24, label: '24개월' },
  ];
}