import type { RankGrade } from './dispatch';

export type { RankGrade };

export interface CrewEmbarkationRecord {
  id: string;
  crew_member_id: string;
  ship_id: string;
  rank_id: string;
  rank_grade: RankGrade | null;       // 승선 중 적용 Grade
  departure_date: string | null;      // 출국일
  embark_date: string;                // 승선일
  disembark_date: string | null;      // 하선일
  return_date: string | null;         // 귀국일
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
  base_departure_date: string | null;
  port_id: string | null;
  deleted_by: string | null;
  deleted_at: string | null;
  approval_document_id: string | null;
}

export interface CrewRotationAssignment {
  id: string;
  rotation_plan_id: string;

  // 하선자 (off-signing)
  off_crew_id: string | null;
  off_rank_id: string | null;
  off_rank_grade: RankGrade | null;
  off_disembark_date: string | null;  // 하선일
  off_return_date: string | null;     // 귀국일
  off_sign_off_reason_id: string | null; // 하선사유
  off_sick_pay_monthly_amount: number | null; // 상병하선 시 상병급여 기준 월액

  // 승선자 (on-signing)
  on_crew_id: string | null;
  on_rank_id: string | null;
  on_rank_grade: RankGrade | null;
  on_departure_date: string | null;   // 출국일

  contract_months: number | null;
  salary_template_id: string | null;
  salary_amount: number | null;
  salary_currency: string;

  embark_date: string;                // 승선일
  notes: string | null;

  created_at: string;
  updated_at: string;
}

// Extended types with joined data
export interface CrewRotationAssignmentWithDetails extends CrewRotationAssignment {
  off_crew_name?: string;
  off_rank_name?: string;
  off_rank_code?: string;
  off_sign_off_reason_name?: string;
  on_crew_name?: string;
  on_rank_name?: string;
  on_rank_code?: string;
}

export interface CrewRotationPlanWithDetails extends CrewRotationPlan {
  ship_name: string;
  owner_name: string;
  fleet_name: string | null;
  created_by_name: string;
  creator_name?: string;
  assignments: CrewRotationAssignmentWithDetails[];
}

// For creating new assignments
export interface CrewRotationAssignmentInput {
  off_crew_id: string | null;
  off_rank_id: string | null;
  off_rank_grade: RankGrade | null;
  off_disembark_date: string | null;
  off_return_date: string | null;
  off_sign_off_reason_id?: string | null;
  off_sick_pay_monthly_amount?: number | null; // 하선사유가 상병하선일 때만 사용 — 상병급여 기준 월액
  on_crew_id: string | null;
  on_rank_id: string | null;
  on_rank_grade: RankGrade | null;
  on_departure_date: string | null;
  contract_months: number | null;
  salary_template_id: string | null;
  salary_amount: number | null;
  salary_currency: string;
  embark_date: string;
  notes: string | null;
}

// Form data for creating/updating rotation plans
export interface RotationPlanFormData {
  ship_id: string;
  owner_id: string;
  fleet_id: string | null;
  plan_name: string;
  rotation_date: string;
  status?: string;
  notes: string | null;
  base_departure_date: string | null;
  port_id: string | null;
  assignments: CrewRotationAssignmentInput[];
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