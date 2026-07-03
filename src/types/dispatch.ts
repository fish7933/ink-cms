export type DispatchType = 'promotion' | 'demotion';
export type DispatchStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'executed';
// 등급은 급여 템플릿에서 직급별로 자유롭게 정의되므로 고정 유니언이 아닌 문자열로 확장.
export type RankGrade = string;
export type RegistrationSource = 'agency_recommended' | 'agency_direct' | 'company_direct';

export const RANK_GRADE_LABELS: Record<string, string> = {
  A: 'A급 (최고)',
  B: 'B급',
  C: 'C급',
  D: 'D급',
};

export const DISPATCH_TYPE_LABELS: Record<DispatchType, string> = {
  promotion: '승진 발령',
  demotion: '강등 발령',
};

export const DISPATCH_STATUS_LABELS: Record<DispatchStatus, string> = {
  draft: '작성중',
  pending_approval: '결재중',
  approved: '승인완료',
  rejected: '반려',
  executed: '발령완료',
};

export const REGISTRATION_SOURCE_LABELS: Record<RegistrationSource, string> = {
  agency_recommended: '매닝사 추천 등록',
  agency_direct: '매닝사 직접 등록',
  company_direct: '본사 직접 등록',
};

export interface CrewDispatchOrder {
  id: string;
  crew_member_id: string;
  ship_id: string | null;

  dispatch_type: DispatchType;

  previous_rank_id: string | null;
  previous_grade: RankGrade | null;
  new_rank_id: string | null;
  new_grade: RankGrade | null;

  effective_date: string;
  approval_request_id: string | null;
  status: DispatchStatus;

  notes: string | null;
  created_by: string;
  executed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrewDispatchOrderWithDetails extends CrewDispatchOrder {
  crew_name: string;
  ship_name: string | null;
  previous_rank_name: string | null;
  previous_rank_code: string | null;
  new_rank_name: string | null;
  new_rank_code: string | null;
  created_by_name: string;
}

export interface CrewDispatchOrderInput {
  crew_member_id: string;
  ship_id: string | null;
  dispatch_type: DispatchType;
  previous_rank_id: string | null;
  previous_grade: RankGrade | null;
  new_rank_id: string | null;
  new_grade: RankGrade | null;
  effective_date: string;
  notes: string | null;
}

// 선원 4단계 카테고리 (UI 탭)
export type CrewCategory = 'registered' | 'standby' | 'onboard' | 'disembarked';

export const CREW_CATEGORY_LABELS: Record<CrewCategory, string> = {
  registered: '등록 선원',
  standby: '대기 선원',
  onboard: '승선중',
  disembarked: '하선 선원',
};

// 카테고리별 status 매핑
export const CREW_CATEGORY_STATUSES: Record<CrewCategory, string[]> = {
  registered: ['registered', 'under_review', 'sent_to_owner', 'owner_approved', 'owner_rejected'],
  standby: ['deployment_decided'],   // + standby이면서 교대계획에 포함된 경우 (서비스 레벨 처리)
  onboard: ['onboard'],
  disembarked: ['standby'],          // standby이면서 교대계획에 미포함 (서비스 레벨 처리)
};
