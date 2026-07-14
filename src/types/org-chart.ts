export interface OrgUnit {
  id: string;
  name: string;
  parent_id: string | null;
  head_user_id: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrgMember {
  id: string; // users.id
  name: string;
  role: string;
  position_id: string | null;
  position_name: string | null;
  position_order: number | null; // shore_positions.display_order — 낮을수록 선임
  hire_date: string | null; // 입사일 — 같은 직급 내 정렬 기준(입사연도가 빠를수록 선임)
  org_unit_ids: string[]; // 소속된 모든 부서 id (한 사람이 여러 부서에 소속 가능)
}

export interface OrgUnitNode extends OrgUnit {
  head_name: string | null;
  head_position_name: string | null;
  head_is_explicit: boolean; // head_user_id로 명시 지정된 것인지, 자동 추정인지
  members: OrgMember[];
  children: OrgUnitNode[];
}

export interface ApprovalChainStep {
  approver_id: string;
  approver_name: string;
  approver_role: string; // "부서명 · 직급" 형태의 표시용 레이블
  org_unit_id: string;
  org_unit_name: string;
}
