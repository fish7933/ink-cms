export type DocumentFormFieldType = 'text' | 'textarea' | 'number' | 'date' | 'select';

export interface DocumentFormField {
  key: string;
  label: string;
  type: DocumentFormFieldType;
  required: boolean;
  options?: string[]; // type === 'select'일 때만 사용
}

export interface ApprovalDocumentType {
  id: string;
  code: string;
  name: string;
  is_free_form: boolean;
  is_active: boolean;
  // null/빈 배열이면 자유 서식(제목+본문). 값이 있으면 기안서 작성 화면이 이 스키마대로 동적 입력폼을 보여준다.
  field_schema: DocumentFormField[] | null;
  // 이 문서유형으로 기안할 때 기본으로 참조(통보) 지정되는 부서 (예: 지출결의서 → 총무팀)
  default_cc_org_unit_ids: string[] | null;
  // 이 문서유형으로 기안할 때 기본으로 채워지는 수신부서 (예: 지출결의서 → 총무팀)
  default_recipient_org_unit_id: string | null;
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

export interface ApprovalDocumentAttachment {
  name: string;
  path: string;
  size: number;
  type: string;
}

export interface ApprovalDocument {
  id: string;
  document_type_id: string;
  title: string;
  content: string | null;
  // 문서유형에 field_schema가 있을 때, 동적 입력폼에서 제출된 값 { [field.key]: value }
  form_data: Record<string, string | number | null> | null;
  attachments: ApprovalDocumentAttachment[];
  reference_type: string | null;
  reference_id: string | null;
  org_unit_id: string | null;
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'cancelled';
  current_step: number;
  created_by: string;
  requester_comment: string | null;
  final_comment: string | null;
  // 반려 후 같은 결재라인으로 다시 상신한 횟수. 0이면 아직 재상신된 적 없음.
  resubmit_count: number;
  // 전결규정 자동계산 대신 결재선 관리의 이 라인을 직접 골라 썼으면 그 id, 자동계산이면 null.
  manual_line_id: string | null;
  // 문서의 공식 수신부서 (결재선/참조와 별개 개념) — 미지정이면 시행문에는 기본 문구로 표시.
  recipient_org_unit_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

// 반려 시점의 기록 — 재상신으로 결재 단계가 초기화돼도 이 이력은 남아 문서에 계속 표시된다.
export interface ApprovalDocumentRejectionHistoryEntry {
  id: string;
  document_id: string;
  round: number;
  rejected_step_order: number;
  rejected_by: string | null;
  rejected_by_name: string;
  rejected_by_label: string | null;
  comment: string;
  rejected_at: string;
}

export interface ApprovalDocumentReference {
  id: string;
  document_id: string;
  user_id: string | null;
  org_unit_id: string | null;
  created_at: string;
}

export interface ApprovalDocumentWithDetails extends ApprovalDocument {
  document_type_name: string;
  creator_name: string;
  org_unit_name: string | null;
  recipient_org_unit_name: string | null;
  steps: ApprovalDocumentStep[];
}
