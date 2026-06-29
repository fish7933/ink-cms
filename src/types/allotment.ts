export interface Allotment {
  id: string;
  crew_member_id: string;
  ship_id?: string;
  allotment_type: 'monthly' | 'bonus' | 'one_time' | 'advance';
  beneficiary_name: string;
  beneficiary_relationship?: string;
  bank_name: string;
  bank_branch?: string;
  account_number: string;
  swift_code?: string;
  amount: number;
  currency: string;
  percentage_of_salary?: number;
  effective_from: string;
  effective_to?: string;
  is_active: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface AllotmentWithDetails extends Allotment {
  crew_name: string;
  rank_name: string;
  ship_name?: string;
}

export interface Remittance {
  id: string;
  allotment_id: string;
  crew_member_id: string;
  remittance_date: string;
  amount: number;
  currency: string;
  exchange_rate?: number;
  local_amount?: number;
  local_currency?: string;
  transaction_reference?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  notes?: string;
  created_at: string;
  updated_at: string;
}
