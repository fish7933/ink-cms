export interface ApprovalDocumentType {
  id: string;
  code: string;
  name: string;
  is_free_form: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ApprovalAuthorityLimit {
  id: string;
  document_type_id: string;
  position_id: string;
  created_at: string;
  updated_at: string;
}

export interface ApprovalDocumentStep {
  id: string;
  document_id: string;
  step_order: number;
  approver_id: string;
  approver_name: string;
  approver_label: string | null;
  status: 'pending' | 'approved' | 'rejected';
  comment: string | null;
  acted_at: string | null;
  created_at: string;
}

export interface ApprovalDocument {
  id: string;
  document_type_id: string;
  title: string;
  content: string | null;
  reference_type: string | null;
  reference_id: string | null;
  org_unit_id: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  current_step: number;
  created_by: string;
  requester_comment: string | null;
  final_comment: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface ApprovalDocumentWithDetails extends ApprovalDocument {
  document_type_name: string;
  creator_name: string;
  org_unit_name: string | null;
  steps: ApprovalDocumentStep[];
}
