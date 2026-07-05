export type AllowancePaymentBasis = 'monthly' | 'lump_sum';
export type AllowancePaymentMethod = 'ship_direct' | 'owner_billed';

export interface AllowanceType {
  id: string;
  code: string;
  name: string;
  description?: string;
  // 지급방식/지급주체는 직급별이 아니라 수당 유형 전체에 일괄 적용
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
  payment_basis: AllowancePaymentBasis;
  payment_method: AllowancePaymentMethod;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface CrewContractAllowanceWithDetails extends CrewContractAllowance {
  allowance_type_name: string;
}
