export type EmployeeSalaryItemCategory = 'base' | 'allowance' | 'deduction';

export interface EmployeeSalaryItem {
  id: string;
  user_id: string;
  category: EmployeeSalaryItemCategory;
  name: string;
  amount: number;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type EmployeePayrollPeriodStatus = 'draft' | 'pending_ack' | 'pending_approval' | 'confirmed';

export interface EmployeePayrollPeriod {
  id: string;
  year_month: string; // 'YYYY-MM'
  status: EmployeePayrollPeriodStatus;
  payment_date: string | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
  approval_document_id: string | null;
  memo: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmployeePayrollPeriodSummary extends EmployeePayrollPeriod {
  payslip_count: number;
  total_net_amount: number;
}

export type PayslipAckStatus = 'pending' | 'approved' | 'disputed';

export interface EmployeePayslip {
  id: string;
  period_id: string;
  user_id: string;
  base_amount: number;
  total_allowance: number;
  total_deduction: number;
  net_amount: number;
  payment_date: string | null;
  memo: string | null;
  ack_status: PayslipAckStatus;
  ack_comment: string | null;
  ack_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmployeePayslipItem {
  id: string;
  payslip_id: string;
  category: EmployeeSalaryItemCategory;
  name: string;
  amount: number;
  display_order: number;
}

export interface EmployeePayslipWithDetails extends EmployeePayslip {
  employee_name: string;
  employee_position_name: string | null;
  employee_hire_date: string | null;
  employee_birth_date: string | null;
  items: EmployeePayslipItem[];
  period_year_month?: string;
  period_status?: EmployeePayrollPeriodStatus;
}

// "직원 확인 현황" 위젯용 — ReferenceReadStatus.tsx와 같은 형태로 쓴다.
export interface PayslipAcknowledgmentEntry {
  payslip_id: string;
  employee_id: string;
  employee_name: string;
  employee_position_name: string | null;
  ack_status: PayslipAckStatus;
  ack_comment: string | null;
  ack_at: string | null;
}

export interface PayrollEmployee {
  id: string;
  name: string;
  role: string;
  position_id: string | null;
  position_name: string | null;
  hire_date: string | null;
}

// 전체 직원 급여대장(표 형태) 출력/엑셀용 — 기본급 옆에 수당/공제 항목을 열(컬럼)로 펼쳐 보여준다.
// 항목명은 직원마다 직접 입력한 값이라 회차 안에서 등장한 이름들의 합집합을 컬럼으로 쓴다.
export interface PayrollLedgerRow {
  employee_id: string;
  employee_name: string;
  resident_registration_number: string | null;
  hire_date: string | null;
  base_amount: number;
  allowance_by_name: Record<string, number>;
  gross_amount: number; // 기본급 + 수당 합계
  deduction_by_name: Record<string, number>;
  total_deduction: number;
  net_amount: number;
}

export interface PayrollLedgerData {
  period: EmployeePayrollPeriod;
  allowance_columns: string[];
  deduction_columns: string[];
  rows: PayrollLedgerRow[];
}
