import type { Company, Fleet, Ship, Rank } from '@/types/models';

/**
 * Calculate contract period based on priority: Ship > Fleet > Company
 * @param rankCategory - 'officer' or 'rating'
 * @param ship - Ship object (optional)
 * @param fleet - Fleet object (optional)
 * @param company - Company object (required)
 * @returns Contract period in months
 */
export function calculateContractPeriod(
  rankCategory: 'officer' | 'rating',
  ship: Ship | null | undefined,
  fleet: Fleet | null | undefined,
  company: Company
): number {
  const field = rankCategory === 'officer' 
    ? 'default_officer_contract_months' 
    : 'default_rating_contract_months';

  // Priority 1: Ship level
  if (ship && ship[field] != null) {
    return ship[field]!;
  }

  // Priority 2: Fleet level
  if (fleet && fleet[field] != null) {
    return fleet[field]!;
  }

  // Priority 3: Company level (default)
  return company[field];
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