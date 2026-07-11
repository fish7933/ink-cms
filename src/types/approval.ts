export interface ApprovalLine {
  id: string;
  company_id: string | null; // null = 전체 회사 공통(내부) 결재선
  name: string;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ApprovalLineStep {
  id: string;
  approval_line_id: string;
  step_order: number;
  approver_id: string;
  approver_name: string;
  approver_role?: string;
  created_at: string;
}

export interface CrewRecommendationApproval {
  id: string;
  crew_recommendation_id: string;
  approval_line_id: string;
  requester_id: string;
  requester_comment?: string;
  current_step: number;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  final_comment?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export interface ApprovalAction {
  id: string;
  approval_request_id: string;
  step_order: number;
  approver_id: string;
  approver_name?: string;
  action: 'approved' | 'rejected';
  comment?: string;
  created_at: string;
}

export interface ApprovalLineWithSteps extends ApprovalLine {
  steps: ApprovalLineStep[];
}

export interface CrewRecommendationApprovalWithDetails extends CrewRecommendationApproval {
  approval_line: ApprovalLineWithSteps;
  requester_name: string;
  requester_role?: string;
  actions: ApprovalAction[];
  current_approver?: ApprovalLineStep;
}

export interface CrewRecommendationApprovalLogAction {
  step_order: number;
  approver_name?: string;
  action: 'approved' | 'rejected';
  comment?: string;
  created_at: string;
}

// 채용(선원추천) 결재가 삭제될 때 남는 영구 이력. 원본 결재/결재액션 행이 지워져도 남는다.
export interface CrewRecommendationApprovalLog {
  id: string;
  crew_recommendation_id: string | null;
  crew_name: string;
  requester_id: string | null;
  requester_name: string;
  approval_line_name?: string;
  final_status: string;
  actions: CrewRecommendationApprovalLogAction[];
  requested_at?: string;
  completed_at?: string;
  deleted_by: string;
  deleted_by_name: string;
  deleted_at: string;
}