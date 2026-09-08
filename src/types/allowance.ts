export type AllowancePaymentBasis = 'monthly' | 'on_embark_once' | 'disembark_settlement';
export type AllowancePaymentMethod = 'ship_direct' | 'owner_billed';
// 수당(급여명세에 더해짐)인지 공제(급여명세에서 빠짐)인지 — 나머지 구조(직급별 기준액,
// 계약별 재정의)는 두 종류가 동일해 테이블을 나누지 않고 이 값으로만 구분한다.
export type AllowanceKind = 'allowance' | 'deduction';

// 수당/공제의 정체성(이름/코드/종류)만 담는 카탈로그. 금액·지급방식·지급주체는 선주별로
// 다르므로 여기 없다 — AllowanceTemplate/AllowanceTemplateItem에서 관리한다.
export interface AllowanceItem {
  id: string;
  code: string;
  name: string;
  description?: string;
  kind: AllowanceKind;
  display_order: number;
  // 템플릿에 항목을 추가할 때 기본으로 제안되는 값일 뿐, 구속력은 없다(실제 값은 템플릿 항목별로 저장).
  payment_basis: AllowancePaymentBasis;
  payment_method: AllowancePaymentMethod;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// 선주(또는 플릿/선박)가 실제로 적용하는 수당/공제 기준 — management_fee_templates와 동일한
// 버전관리 구조(effective_from/effective_until/root_template_id).
export interface AllowanceTemplate {
  id: string;
  name: string;
  description?: string;
  is_active: boolean;
  effective_from: string;
  effective_until?: string | null;
  root_template_id?: string | null;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface AllowanceTemplateItem {
  id: string;
  template_id: string;
  allowance_item_id: string;
  rank_id?: string | null; // null = 전 직급 공통
  kind: AllowanceKind;
  amount: number;
  currency: string;
  payment_basis: AllowancePaymentBasis;
  payment_method: AllowancePaymentMethod;
  notes?: string;
  // 지급 조건 — 전부 null/기본값이면 조건 없이 무조건 지급. 시스템은 이 조건으로 지급
  // 대상 여부를 판정해 발령 화면에 보여줄 뿐, 최종 적용 여부는 발령자가 결정한다.
  max_payout_count?: number | null; // 같은 선원에게 지급 가능한 최대 횟수
  min_prior_contract_months?: number | null; // 직전 승선기록이 이 개월수 이상이어야 지급 대상
  max_gap_months?: number | null; // 직전 하선(귀국)일로부터 이 개월수 이내 재승선해야 지급 대상
  reset_on_owner_change: boolean; // 직전 계약과 선주가 다르면 max_payout_count 카운트 리셋
  created_at: string;
  updated_at: string;
}

export type AllowanceTemplateItemInput = {
  allowance_item_id: string;
  rank_id?: string | null;
  kind: AllowanceKind;
  amount: number;
  currency: string;
  payment_basis: AllowancePaymentBasis;
  payment_method: AllowancePaymentMethod;
  notes?: string;
  max_payout_count?: number | null;
  min_prior_contract_months?: number | null;
  max_gap_months?: number | null;
  reset_on_owner_change: boolean;
};

export interface AllowanceTemplateWithItems extends AllowanceTemplate {
  items: (AllowanceTemplateItem & { allowance_item: AllowanceItem })[];
}

export interface ShipAllowanceTemplateAssignment {
  id: string;
  ship_id: string;
  template_id: string;
  assigned_by?: string;
  assigned_at: string;
  updated_at: string;
}

export interface FleetAllowanceTemplateAssignment {
  id: string;
  fleet_id: string;
  template_id: string;
  assigned_by?: string;
  assigned_at: string;
  updated_at: string;
}

export interface OwnerAllowanceTemplateAssignment {
  id: string;
  owner_id: string;
  template_id: string;
  assigned_by?: string;
  assigned_at: string;
  updated_at: string;
}

export interface CrewContractAllowance {
  id: string;
  contract_id: string;
  allowance_item_id: string;
  amount: number;
  currency: string;
  kind: AllowanceKind;
  payment_basis: AllowancePaymentBasis;
  payment_method: AllowancePaymentMethod;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface CrewContractAllowanceWithDetails extends CrewContractAllowance {
  allowance_item_name: string;
  allowance_item_description?: string;
}
