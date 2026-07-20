export type AllowancePaymentBasis = 'monthly' | 'lump_sum';
export type AllowancePaymentMethod = 'ship_direct' | 'owner_billed';
// 수당(급여명세에 더해짐)인지 공제(급여명세에서 빠짐)인지 — 나머지 구조(직급별 기준액,
// 계약별 재정의)는 두 종류가 동일해 테이블을 나누지 않고 이 값으로만 구분한다.
export type AllowanceKind = 'allowance' | 'deduction';

export interface AllowanceType {
  id: string;
  code: string;
  name: string;
  description?: string;
  kind: AllowanceKind;
  // 지급방식/지급주체는 직급별이 아니라 수당 유형 전체에 일괄 적용 (공제는 의미가 약해 기본값만 유지)
  payment_basis: AllowancePaymentBasis;
  payment_method: AllowancePaymentMethod;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AllowanceRankRate {
  id: string;
  allowance_type_id: string;
  rank_id: string;
  amount: number;
  currency: string;
  created_at: string;
  updated_at: string;
}

export interface AllowanceRankRateWithDetails extends AllowanceRankRate {
  rank_name: string;
  rank_code: string;
}

export interface CrewContractAllowance {
  id: string;
  contract_id: string;
  allowance_type_id: string;
  amount: number;
  currency: string;
  kind: AllowanceKind;
  payment_basis: AllowancePaymentBasis;
  payment_method: AllowancePaymentMethod;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface CrewContractAllowanceWithDetails extends CrewContractAllowance {
  allowance_type_name: string;
}
