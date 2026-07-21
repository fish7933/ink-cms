import type { TemplateMatrix } from '@/lib/salary-template-matrix';

export type CrewPayrollPeriodStatus = 'draft' | 'pending_approval' | 'confirmed';

export interface CrewPayrollPeriod {
  id: string;
  ship_id: string;
  year_month: string; // 'YYYY-MM'
  status: CrewPayrollPeriodStatus;
  currency: string;
  payment_date: string | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
  approval_document_id: string | null;
  memo: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrewPayrollPeriodSummary extends CrewPayrollPeriod {
  ship_name: string;
  owner_name?: string;
  fleet_name?: string;
  payslip_count: number;
  total_net_amount: number;
}

export interface CrewPayslip {
  id: string;
  period_id: string;
  crew_member_id: string;
  embarkation_record_id: string | null;
  rank_id: string | null;
  rank_grade: string | null;
  period_start_date: string; // 그 달 실제 근무 시작일 (승선일과 월초 중 늦은 날)
  period_end_date: string;   // 그 달 실제 근무 종료일 (하선일과 월말 중 이른 날)
  days_served: number;
  days_in_month: number;
  base_amount: number;
  total_allowance: number;
  total_deduction: number;
  total_owner_billed: number;
  net_amount: number;
  currency: string;
  memo: string | null;
  created_at: string;
  updated_at: string;
}

// 명세서 항목 — source='template'은 선박 급여 템플릿에서, source='contract'는 선원 계약별
// 수당/공제(crew_contract_allowances)에서 가져온 것. payment_method='owner_billed'인
// 수당은 선주에게 별도 청구되는 금액이라 net_amount(실지급액) 합산에서 제외된다.
//
// payment_type: 급여 구성항목이 payment_type='deferred'(후불성, 예: 휴가비/LP)인 경우 —
// 매월 정상적으로 지급되지 않고 'deferred_accrual'로 누적만 되며(net_amount 제외),
// 하선월에 그동안 쌓인 금액 전체가 'deferred_payout'(1건, net_amount 포함)으로 일괄 지급된다.
export interface CrewPayslipItem {
  id: string;
  payslip_id: string;
  source: 'template' | 'contract';
  category: 'earning' | 'deduction';
  name: string;
  payment_method: 'ship_direct' | 'owner_billed' | null;
  payment_type: 'immediate' | 'deferred_accrual' | 'deferred_payout';
  standard_amount: number; // 일할계산 적용 전 월 기준액
  amount: number;          // 일할계산 적용 후 실제 반영 금액(deferred_payout은 승선 기간 전체 누적액)
  accrued_to_date: number | null; // deferred_accrual/payout 항목의 승선일~이 달 말 누적액
  description: string | null; // 급여 구성항목/수당유형의 설명 — 생성 시점 스냅샷
  display_order: number;
}

export interface CrewPayslipWithDetails extends CrewPayslip {
  crew_name: string;
  rank_name: string;
  rank_code: string;
  nationality?: string;
  items: CrewPayslipItem[];
  period_year_month?: string;
  period_status?: CrewPayrollPeriodStatus;
}

// 급여대장(선박에 승선한 선원 전원을 한 표로) 출력/엑셀용 — 급여 구성항목(BW/OT/OA/LP 등)과
// 계약별 수당/공제를 "기본급" 한 칸으로 뭉치지 않고 항목명별 열(컬럼)로 모두 펼쳐 보여준다.
export interface CrewPayrollLedgerRow {
  crew_member_id: string;
  crew_name: string;
  rank_code: string;
  rank_grade: string | null;
  period_start_date: string;
  period_end_date: string;
  days_served: number;
  days_in_month: number;
  base_amount: number;
  allowance_by_name: Record<string, number>;
  gross_amount: number; // 기본급 + 수당(ship_direct만) 합계
  deduction_by_name: Record<string, number>;
  total_deduction: number;
  net_amount: number;
  owner_billed_amount: number; // 선주에게 별도 청구되는 수당 합계 (net_amount에는 포함 안 됨)
}

export interface CrewPayrollLedgerData {
  period: CrewPayrollPeriod;
  ship_name: string;
  owner_name?: string;
  fleet_name?: string;
  template_name?: string; // 이 선박에 적용된 급여 템플릿명
  template_matrix?: TemplateMatrix; // 그 템플릿의 직급/등급별 급여 항목 전체 내용
  allowance_columns: string[];
  deduction_columns: string[];
  rows: CrewPayrollLedgerRow[];
}

// 월별 전 선박 대시보드 한 행 — 그 달 회차가 없는 선박도 status='none'으로 표시된다.
export interface CrewPayrollDashboardRow {
  ship_id: string;
  ship_name: string;
  owner_id?: string;
  owner_name?: string;
  fleet_id?: string;
  fleet_name?: string;
  period_id: string | null;
  status: CrewPayrollPeriodStatus | 'none';
  payslip_count: number;
  total_net_amount: number;
  total_owner_billed: number;
}

export type CrewPayrollBillingGroupLevel = 'owner' | 'fleet' | 'ship';

export interface CrewPayrollBillingShipSection {
  ship_id: string;
  ship_name: string;
  owner_name?: string;
  fleet_name?: string;
  template_name?: string; // 이 선박에 적용된 급여 템플릿명
  template_matrix?: TemplateMatrix;
  period_year_month: string;
  allowance_columns: string[];
  deduction_columns: string[];
  rows: CrewPayrollLedgerRow[];
  subtotal_net: number;
  subtotal_owner_billed: number;
}

export interface CrewPayrollBillingData {
  year_month: string;
  group_level: CrewPayrollBillingGroupLevel;
  group_label: string; // "전체" 또는 선택된 선주/플릿/선박 이름
  ships: CrewPayrollBillingShipSection[];
  grand_total_net: number;
  grand_total_owner_billed: number;
}
