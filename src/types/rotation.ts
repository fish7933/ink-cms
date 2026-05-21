export interface CrewEmbarkationRecord {
  id: string;
  crew_member_id: string;
  ship_id: string;
  rank_id: string;
  embark_date: string;
  disembark_date: string | null;
  contract_months: number | null;
  salary_template_id: string | null;
  salary_amount: number | null;
  salary_currency: string;
  status: 'active' | 'completed' | 'cancelled';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrewRotationPlan {
  id: string;
  ship_id: string;
  owner_id: string;
  fleet_id: string | null;
  plan_name: string;
  rotation_date: string;
  status: 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'executed';
  created_by: string;
  created_at: string;
  updated_at: string;
  approval_request_id: string | null;
  executed_at: string | null;
  notes: string | null;
}

export interface CrewRotationAssignment {
  id: string;
  rotation_plan_id: string;
  
  // Off-signing crew (disembarking) - optional
  off_crew_id: string | null;
  off_rank_id: string | null;
  
  // On-signing crew (embarking) - optional
  on_crew_id: string | null;
  on_rank_id: string | null;
  
  contract_months: number | null;
  salary_template_id: string | null;
  salary_amount: number | null;
  salary_currency: string;
  
  embark_date: string;
  notes: string | null;
  
  created_at: string;
  updated_at: string;
}

// Extended types with joined data
export interface CrewRotationAssignmentWithDetails extends CrewRotationAssignment {
  off_crew_name?: string;
  off_rank_name?: string;
  on_crew_name?: string;
  on_rank_name?: string;
}

export interface CrewRotationPlanWithDetails extends CrewRotationPlan {
  ship_name: string;
  owner_name: string;
  fleet_name: string | null;
  created_by_name: string;
  assignments: CrewRotationAssignmentWithDetails[];
}

// For creating new assignments
export interface CrewRotationAssignmentInput {
  off_crew_id: string | null;
  off_rank_id: string | null;
  on_crew_id: string | null;
  on_rank_id: string | null;
  contract_months: number | null;
  salary_template_id: string | null;
  salary_amount: number | null;
  salary_currency: string;
  embark_date: string;
  notes: string | null;
}

// Crew member with current assignment info
export interface CrewMemberForRotation {
  id: string;
  name: string;
  rank_id: string;
  rank_name: string;
  status: string;
  current_ship_id: string | null;
  nationality: string | null;
}