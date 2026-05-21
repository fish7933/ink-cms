export interface Assignment {
  id: string;
  assignment_type: 'owner' | 'fleet' | 'ship';
  entity_id: string;
  user_id: string;
  assigned_by: string | null;
  role: 'owner_manager' | 'fleet_manager' | 'ship_manager' | 'manning_manager';
  created_at: string;
  updated_at: string;
}

export interface ApprovalStep {
  order: number;
  user_id: string;
  required: boolean;
}

export interface ApprovalLine {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  approval_type: 'hiring' | 'salary_change' | 'contract' | 'general';
  steps: ApprovalStep[];
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApprovalRequest {
  id: string;
  approval_line_id: string;
  request_type: 'hiring' | 'salary_change' | 'contract' | 'general';
  title: string;
  description: string | null;
  reference_id: string | null;
  reference_type: string | null;
  requested_by: string;
  current_step: number;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  created_at: string;
  updated_at: string;
}

export interface ApprovalAction {
  id: string;
  approval_request_id: string;
  step_order: number;
  approver_id: string;
  action: 'approved' | 'rejected' | 'pending';
  comments: string | null;
  acted_at: string | null;
  created_at: string;
}