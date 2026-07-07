export interface CrewContract {
  id: string;
  crew_member_id: string;
  ship_id?: string;
  owner_id?: string;
  fleet_id?: string;
  nationality?: string;
  contract_number?: string;
  contract_type: 'initial' | 'renewal' | 'extension' | 'transfer';
  root_contract_id?: string | null;
  rank: string;
  start_date: string;
  end_date: string;
  duration_months?: number;
  salary_amount?: number;
  salary_currency?: string;
  overtime_rate?: number;
  leave_pay?: number;
  terms_and_conditions?: string;
  status: 'draft' | 'active' | 'completed' | 'terminated' | 'renewed';
  terminated_reason?: string;
  terminated_date?: string;
  document_url?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface CrewContractWithDetails extends CrewContract {
  crew_name: string;
  rank_name: string;
  rank_code: string;
  ship_name?: string;
  owner_name?: string;
  fleet_name?: string;
}
